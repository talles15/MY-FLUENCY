/**
 * Transforma a resposta do Azure Speech (Pronunciation Assessment, formato Detailed) no formato do motor:
 *   words: [{ word, start, end }]  — segundos, com a pontuação do texto exibido
 *   pronunciation: { accuracy, stress, prosody, unintelligiblePer100 } | null
 * Também devolve `transcript` (texto com pontuação) e `wordScores` (nota por palavra, para a tela).
 *
 * Aceita um JSON único ou a lista de JSONs de vários trechos (reconhecimento contínuo).
 */

const TICKS_PER_SEC = 1e7; // Offset e Duration vêm em unidades de 100 ns
export const UNINTELLIGIBLE_BELOW = 40; // palavra com accuracy < 40 conta como ininteligível

const key = (s) => String(s).toLowerCase().replace(/[’`]/g, "'").replace(/[^a-z0-9à-ÿ']/g, "");
const round1 = (x) => Math.round(x * 10) / 10;
const pa = (x) => (x && x.PronunciationAssessment) || x || {};

/** Erros de prosódia da palavra que indicam acento/entonação (Azure: Feedback.Prosody.Intonation.ErrorTypes). */
function stressErrors(w) {
  const pros = pa(w).Feedback && pa(w).Feedback.Prosody;
  if (!pros) return null; // o Azure não avaliou prosódia desta palavra
  const types = [...((pros.Intonation && pros.Intonation.ErrorTypes) || [])];
  if (/stress/i.test(pa(w).ErrorType || "")) types.push(pa(w).ErrorType);
  return types.filter((t) => t && t !== "None");
}

/**
 * Casa as palavras do Azure (forma lexical, sem pontuação) com os tokens do texto exibido,
 * para recuperar vírgulas e pontos. Se não achar (ex.: "twenty" vs "20"), fica a forma lexical.
 */
function attachPunctuation(azWords, display) {
  const toks = String(display || "").split(/\s+/).filter(Boolean);
  let j = 0;
  return azWords.map((w) => {
    const k = key(w.Word);
    for (let a = j; a < Math.min(toks.length, j + 4); a++) {
      if (key(toks[a]) === k) { j = a + 1; return toks[a]; }
    }
    return w.Word;
  });
}

export function normalizeAzure(input) {
  const segments = (Array.isArray(input) ? input : [input]).filter(
    (s) => s && (!s.RecognitionStatus || s.RecognitionStatus === "Success") && s.NBest && s.NBest.length,
  );

  const words = [], wordScores = [], texts = [];
  let accSum = 0, accW = 0, proSum = 0, proW = 0, confSum = 0, confW = 0;
  let directStress = null, directStressW = 0;

  for (const seg of segments) {
    const best = seg.NBest[0];
    const azWords = (best.Words || []).filter((w) => pa(w).ErrorType !== "Omission" && Number.isFinite(w.Offset));
    if (!azWords.length) continue;
    const shown = attachPunctuation(azWords, seg.DisplayText || best.Display);
    azWords.forEach((w, i) => {
      const start = w.Offset / TICKS_PER_SEC;
      words.push({ word: shown[i], start: round1000(start), end: round1000(start + (w.Duration || 0) / TICKS_PER_SEC) });
      wordScores.push({
        word: shown[i],
        accuracy: pa(w).AccuracyScore ?? null,
        errorType: pa(w).ErrorType || "None",
        stressErrors: stressErrors(w),
      });
    });
    texts.push(shown.join(" "));

    const n = azWords.length;
    const segPa = pa(best);
    if (Number.isFinite(segPa.AccuracyScore)) { accSum += segPa.AccuracyScore * n; accW += n; }
    if (Number.isFinite(segPa.ProsodyScore)) { proSum += segPa.ProsodyScore * n; proW += n; }
    // se um dia o Azure der uma nota direta de acento, ela tem prioridade
    const ds = segPa.StressScore ?? segPa.WordStressScore;
    if (Number.isFinite(ds)) { directStress = (directStress || 0) + ds * n; directStressW += n; }
    if (Number.isFinite(best.Confidence)) { confSum += best.Confidence * n; confW += n; }
  }

  const transcript = texts.join(" ").trim();
  if (!words.length) return { transcript, words, wordScores, pronunciation: null };

  // palavras avaliadas = as que têm nota (inserções sem nota ficam de fora)
  const scored = wordScores.filter((w) => Number.isFinite(w.accuracy));
  let accuracy = accW ? accSum / accW : scored.length ? scored.reduce((s, w) => s + w.accuracy, 0) / scored.length : null;
  let estimated = false;
  if (accuracy == null && confW) { accuracy = (confSum / confW) * 100; estimated = true; } // sem avaliação: confiança do ASR

  let stress = null;
  if (directStressW) stress = directStress / directStressW;
  else {
    const withProsody = wordScores.filter((w) => w.stressErrors && w.errorType !== "Insertion");
    if (withProsody.length) stress = (withProsody.filter((w) => w.stressErrors.length === 0).length / withProsody.length) * 100;
  }

  const unintelligible = scored.filter((w) => w.accuracy < UNINTELLIGIBLE_BELOW).length;
  const pronunciation = accuracy == null ? null : {
    accuracy: round1(accuracy),
    stress: stress == null ? null : round1(stress),
    prosody: proW ? round1(proSum / proW) : null,
    unintelligiblePer100: scored.length ? round1((unintelligible / scored.length) * 100) : null,
    ...(estimated ? { estimated: true } : {}),
  };
  return { transcript, words, wordScores, pronunciation };
}

function round1000(x) { return Math.round(x * 1000) / 1000; }
