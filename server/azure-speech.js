import sdk from "microsoft-cognitiveservices-speech-sdk";
import { pcmFromWav } from "./audio.js";

/**
 * Cliente do Azure Speech com Pronunciation Assessment.
 * - sem referenceText: modo sem roteiro (fala livre), usado na conversa;
 * - com referenceText: modo com roteiro, usado na aba Pronúncia.
 * Devolve a lista de JSONs crus (um por trecho reconhecido); quem interpreta é normalize-azure.js.
 */
export function createAzureSpeech({ key, region, language = "en-US", timeoutMs = 120000 }) {
  if (!key || !region) return null;

  async function assess(wav, { referenceText = "" } = {}) {
    const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
    speechConfig.speechRecognitionLanguage = language;
    speechConfig.outputFormat = sdk.OutputFormat.Detailed;
    speechConfig.requestWordLevelTimestamps();

    const push = sdk.AudioInputStream.createPushStream(sdk.AudioStreamFormat.getWaveFormatPCM(16000, 16, 1));
    const pcm = pcmFromWav(wav);
    push.write(pcm.buffer.slice(pcm.byteOffset, pcm.byteOffset + pcm.byteLength));
    push.close();

    const recognizer = new sdk.SpeechRecognizer(speechConfig, sdk.AudioConfig.fromStreamInput(push));
    const pa = new sdk.PronunciationAssessmentConfig(
      referenceText,
      sdk.PronunciationAssessmentGradingSystem.HundredMark,
      sdk.PronunciationAssessmentGranularity.Phoneme,
      !!referenceText, // miscue (omissões/inserções) só faz sentido com roteiro
    );
    pa.enableProsodyAssessment = true;
    pa.applyTo(recognizer);

    const results = [];
    return await new Promise((resolve, reject) => {
      let done = false;
      const finish = (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        recognizer.stopContinuousRecognitionAsync(
          () => { recognizer.close(); err ? reject(err) : resolve(results); },
          () => { recognizer.close(); err ? reject(err) : resolve(results); },
        );
      };
      const timer = setTimeout(() => finish(new Error("O serviço de pronúncia demorou demais para responder.")), timeoutMs);
      recognizer.recognized = (_s, e) => {
        if (e.result.reason !== sdk.ResultReason.RecognizedSpeech) return;
        const raw = e.result.properties.getProperty(sdk.PropertyId.SpeechServiceResponse_JsonResult);
        try { results.push(JSON.parse(raw)); } catch { /* trecho ilegível: ignora */ }
      };
      recognizer.canceled = (_s, e) => {
        if (e.reason === sdk.CancellationReason.Error) finish(new Error(`Azure Speech: ${e.errorDetails || "erro desconhecido"}`));
        else finish(); // fim do áudio
      };
      recognizer.sessionStopped = () => finish();
      recognizer.startContinuousRecognitionAsync(() => {}, (err) => finish(new Error(String(err))));
    });
  }

  return { assess };
}
