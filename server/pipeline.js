import { toWav16kMono, wavSeconds } from "./audio.js";
import { normalizeAzure } from "./normalize-azure.js";

export const MAX_AUDIO_SECONDS = 180;

/**
 * Etapa 1 do pipeline: áudio -> WAV 16 kHz -> Azure -> { transcript, words, pronunciation }.
 * Se o Azure falhar (ou não estiver configurado), segue com pronunciation = null e usa a
 * transcrição de reserva (reconhecimento do navegador ou texto digitado), sem tempos por palavra.
 */
export async function transcribe({ audio, text, fallbackTranscript, speech, referenceText }) {
  const out = { transcript: "", words: [], wordScores: [], pronunciation: null, wav: null, speechError: null, source: null };

  if (audio && audio.length) {
    out.wav = await toWav16kMono(audio);
    if (wavSeconds(out.wav) > MAX_AUDIO_SECONDS) {
      const e = new Error(`O áudio passou de ${MAX_AUDIO_SECONDS / 60} minutos. Grave uma resposta mais curta.`);
      e.status = 400;
      throw e;
    }
    if (speech) {
      try {
        const n = normalizeAzure(await speech.assess(out.wav, { referenceText }));
        Object.assign(out, { transcript: n.transcript, words: n.words, wordScores: n.wordScores, pronunciation: n.pronunciation, source: "azure" });
      } catch (err) {
        out.speechError = err.message;
      }
    } else {
      out.speechError = "Serviço de pronúncia não configurado (AZURE_SPEECH_KEY/REGION).";
    }
  }

  if (!out.transcript) {
    const backup = String(text || fallbackTranscript || "").trim();
    if (backup) {
      Object.assign(out, { transcript: backup, words: [], wordScores: [], pronunciation: null, source: text ? "typed" : "browser" });
    }
  }
  return out;
}
