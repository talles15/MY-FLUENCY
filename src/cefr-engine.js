/**
 * cefr-engine.js — motor de pontuação CEFR para respostas faladas em inglês.
 *
 * Implementa o documento "Avaliação de vocabulário e níveis de fluência (CEFR)":
 *   - 4 dimensões (pronúncia, fluência, gramática, vocabulário), 25% cada;
 *   - cada métrica vira 0–100 por interpolação entre âncoras por nível;
 *   - nota final -> nível A1..C2 (com "+" na metade de cima da faixa);
 *   - teto pela dimensão mais fraca, amostra mínima, portão de tarefa
 *     argumentativa para B2+, histerese de 3 sessões e detecção de fala lida.
 *
 * Sem dependências. Funciona no navegador (ES module) e no Node >= 18.
 * Todos os números marcados [S] são suposições a calibrar com dados reais.
 */

/* ------------------------------------------------------------------ */
/* Constantes                                                          */
/* ------------------------------------------------------------------ */

export const LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"];

/** Faixas da nota final (0–100). */
export const BANDS = [
  { level: "A1", min: 0, max: 19 },
  { level: "A2", min: 20, max: 39 },
  { level: "B1", min: 40, max: 59 },
  { level: "B2", min: 60, max: 74 },
  { level: "C1", min: 75, max: 89 },
  { level: "C2", min: 90, max: 100 },
];

/** Nota 0–100 atribuída a quem bate exatamente a âncora de cada nível (centro da faixa). */
export const ANCHOR_SCORES = [10, 30, 50, 67, 82, 95];

/** Pesos das dimensões — decididos em 25/11/2026: iguais. */
export const DIMENSION_WEIGHTS = { pronunciation: 0.25, fluency: 0.25, grammar: 0.25, vocabulary: 0.25 };

/** Pesos internos de cada dimensão. */
export const SUB_WEIGHTS = {
  vocabulary: { variety: 0.35, level: 0.35, precision: 0.2, expressions: 0.1 },
  pronunciation: { accuracy: 0.5, stress: 0.2, prosody: 0.2, intelligibility: 0.1 },
  fluency: { speechRate: 0.3, meanLengthOfRun: 0.3, longPauses: 0.2, hesitations: 0.2 },
  grammar: { errors: 0.5, complexity: 0.25, variety: 0.25 },
};

/**
 * Âncoras por nível [S]: valor da métrica esperado em A1, A2, B1, B2, C1, C2.
 * Métricas "quanto menor melhor" têm valores decrescentes; o interpolador detecta sozinho.
 */
export const ANCHORS = {
  // vocabulário
  mattr: [0.55, 0.6, 0.65, 0.7, 0.75, 0.8], // [S] calibrar: textos curtos e bem escritos ficam todos perto de 0,85
  pctB2plus: [0.5, 1.5, 3.5, 6, 10, 15], // recalibrado com os 6 exemplos e a lista CEFR-J + Octanove
  lexicalErrorsPer100: [10, 7, 5, 3, 1.5, 0.5],
  expressionsPer100: [0, 0.5, 1.5, 3, 4.5, 6],
  // pronúncia (notas 0–100 vindas do motor de pronúncia)
  pronAccuracy: [50, 60, 70, 78, 85, 90],
  unintelligiblePer100: [10, 6, 3, 2, 1, 0.3],
  // fluência
  wordsPerMinute: [60, 80, 100, 120, 135, 150],
  meanLengthOfRun: [2, 3, 5, 7, 9, 11],
  longPausesPerMinute: [10, 8, 6, 4, 2, 1],
  hesitationsPer100: [15, 12, 8, 5, 3, 1.5],
  // gramática
  grammarErrorsPer100: [15, 11, 7, 4, 2, 1],
  wordsPerTUnit: [5, 6, 8, 10, 12, 14],
};

export const RULES = {
  minWordsPerResponse: 40,
  minResponsesPerSession: 3,
  minWordsPerSession: 150,
  minDistinctTasks: 3,
  argumentRequiredFromLevel: "B2",
  hysteresisSessions: 3,
  shortPauseSec: 0.25,
  longPauseSec: 1.0,
  readAloudWpm: 170,
};

/** Estruturas gramaticais e o nível em que passam a contar (o LLM devolve estes ids). */
export const STRUCTURES = {
  present_simple: "A1", present_continuous: "A1", can_ability: "A1", there_is_are: "A1",
  past_simple: "A2", going_to_future: "A2", comparatives: "A2", superlatives: "A2", because_so_clauses: "A2",
  present_perfect: "B1", past_continuous: "B1", will_future: "B1", first_conditional: "B1",
  second_conditional: "B1", relative_clauses_defining: "B1", modals_obligation: "B1", used_to: "B1",
  gerund_infinitive_patterns: "B1",
  past_perfect: "B2", passive_voice: "B2", third_conditional: "B2", reported_speech: "B2",
  relative_clauses_non_defining: "B2", modal_perfect: "B2", although_despite_contrast: "B2",
  present_perfect_continuous: "B2", wish_regret: "B2",
  inversion: "C1", cleft_sentences: "C1", mixed_conditionals: "C1", participle_clauses: "C1",
  advanced_hedging: "C1", nominalisation: "C1",
  subjunctive: "C2", fronting_for_emphasis: "C2", ellipsis_substitution: "C2",
};

const FILLERS = new Set(["uh", "um", "er", "erm", "uhm", "hmm", "mm", "ah", "eh", "ee", "éé", "ahn", "tipo"]);

/** Palavras funcionais (não entram na medição de nível CEFR das palavras). */
const FUNCTION_WORDS = new Set(`a an the and or but so because if then than that this these those
there here i me my mine you your yours he him his she her hers it its we us our ours they them
their theirs what which who whom whose when where why how is am are was were be been being do
does did done have has had having will would shall should can could may might must not no yes
of in on at to for from by with about as into onto over under up down out off again very too
also just only all any some each every both either neither one two three first ok okay well
oh really much many more most less few lot lots`.split(/\s+/));

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const clamp = (x, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const round1 = (x) => Math.round(x * 10) / 10;
export const levelIndex = (l) => LEVELS.indexOf(l);

/** Tokeniza em palavras minúsculas (mantém contrações). */
export function tokenize(text) {
  return (String(text).toLowerCase().replace(/[’`]/g, "'").match(/[a-zà-ÿ]+(?:'[a-z]+)?/g) || []);
}

/**
 * Converte o valor de uma métrica em nota 0–100 interpolando entre as âncoras.
 * Fora das âncoras, extrapola com a inclinação do segmento da ponta e limita a [0, 100].
 */
export function scoreFromAnchors(value, anchors, anchorScores = ANCHOR_SCORES) {
  if (value == null || !Number.isFinite(value)) return null;
  const desc = anchors[0] > anchors[anchors.length - 1];
  const a = desc ? anchors.map((v) => -v) : anchors;
  const v = desc ? -value : value;
  const n = a.length;
  let i;
  if (v <= a[0]) i = 0;
  else if (v >= a[n - 1]) i = n - 2;
  else for (i = 0; i < n - 1; i++) if (v >= a[i] && v <= a[i + 1]) break;
  const x0 = a[i], x1 = a[i + 1], y0 = anchorScores[i], y1 = anchorScores[i + 1];
  const y = x1 === x0 ? y0 : y0 + ((v - x0) * (y1 - y0)) / (x1 - x0);
  return round1(clamp(y));
}

/** Média ponderada que ignora componentes nulos (renormaliza os pesos restantes). */
export function weightedMean(parts, weights) {
  let s = 0, w = 0;
  for (const k of Object.keys(weights)) {
    if (parts[k] == null) continue;
    s += parts[k] * weights[k];
    w += weights[k];
  }
  return w ? round1(s / w) : null;
}

/** Nível e subnível de uma nota 0–100. */
export function levelFromScore(score) {
  if (score == null) return null;
  const s = clamp(score);
  const b = BANDS.find((x) => s >= x.min && s < x.max + 1) || BANDS[BANDS.length - 1];
  const mid = (b.min + b.max) / 2;
  const plus = b.level !== "C2" && s >= mid;
  return { level: b.level, plus, label: b.level + (plus ? "+" : "") };
}

/* ------------------------------------------------------------------ */
/* Vocabulário                                                         */
/* ------------------------------------------------------------------ */

/** MATTR: média da razão tipo/ocorrência em janelas móveis de `win` tokens. */
export function mattr(tokens, win = 50) {
  // com menos de `win` palavras a razão fica artificialmente alta (quase tudo é palavra nova),
  // então não é confiável: devolve null e a variedade sai da média dessa resposta.
  if (tokens.length < win) return null;
  const counts = new Map();
  let types = 0, sum = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    counts.set(t, (counts.get(t) || 0) + 1);
    if (counts.get(t) === 1) types++;
    if (i >= win) {
      const o = tokens[i - win];
      counts.set(o, counts.get(o) - 1);
      if (counts.get(o) === 0) types--;
    }
    if (i >= win - 1) sum += types / win;
  }
  return sum / (tokens.length - win + 1);
}

/**
 * Lematizador simples por regras: devolve candidatos para procurar na lista CEFR.
 * Troque por um lematizador de verdade (ex.: wink-nlp) quando tiver dependências.
 */
export function lemmaCandidates(word) {
  const w = word.replace(/'s$|n't$|'re$|'ve$|'ll$|'d$|'m$/, "");
  const c = [w];
  const add = (x) => x && x.length > 1 && !c.includes(x) && c.push(x);
  if (w.endsWith("ies")) add(w.slice(0, -3) + "y");
  if (w.endsWith("es")) add(w.slice(0, -2));
  if (w.endsWith("s") && !w.endsWith("ss")) add(w.slice(0, -1));
  if (w.endsWith("ied")) add(w.slice(0, -3) + "y");
  if (w.endsWith("ed")) { add(w.slice(0, -2)); add(w.slice(0, -1)); if (/(.)\1ed$/.test(w)) add(w.slice(0, -3)); }
  if (w.endsWith("ing")) { add(w.slice(0, -3)); add(w.slice(0, -3) + "e"); if (/(.)\1ing$/.test(w)) add(w.slice(0, -4)); }
  if (w.endsWith("er")) { add(w.slice(0, -2)); add(w.slice(0, -1)); }
  if (w.endsWith("est")) { add(w.slice(0, -3)); add(w.slice(0, -2)); }
  if (w.endsWith("ier")) add(w.slice(0, -3) + "y");
  if (w.endsWith("ly")) { add(w.slice(0, -2)); if (w.endsWith("ily")) add(w.slice(0, -3) + "y"); }
  return c;
}

/** Divide uma linha CSV respeitando aspas. */
function splitCsvLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === "," && !q) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

/** Junta várias listas (ex.: CEFR-J A1–B2 + Octanove C1–C2); fica o nível mais baixo de cada lema. */
export function mergeWordlists(...maps) {
  const out = new Map();
  for (const m of maps) for (const [k, v] of m) if (!out.has(k) || levelIndex(v) < levelIndex(out.get(k))) out.set(k, v);
  return out;
}

/**
 * Lista de palavras -> Map(lema -> nível). Aceita CSV com cabeçalho contendo
 * colunas "headword" e "CEFR" (formato das listas CEFR-J e Octanove).
 * Se uma palavra aparece em mais de um nível, fica o mais baixo.
 */
export function parseWordlistCsv(csv) {
  const lines = String(csv).split(/\r?\n/).filter(Boolean);
  const head = splitCsvLine(lines.shift()).map((h) => h.trim().toLowerCase());
  const hi = head.indexOf("headword"), li = head.indexOf("cefr");
  if (hi < 0 || li < 0) throw new Error("CSV precisa das colunas headword e CEFR");
  const map = new Map();
  for (const line of lines) {
    const cols = splitCsvLine(line);
    const lvl = (cols[li] || "").trim().toUpperCase();
    if (!LEVELS.includes(lvl)) continue;
    for (const hw of (cols[hi] || "").split("/")) {
      const k = hw.trim().toLowerCase();
      if (!k) continue;
      if (!map.has(k) || levelIndex(lvl) < levelIndex(map.get(k))) map.set(k, lvl);
    }
  }
  return map;
}

/**
 * Perfil CEFR das palavras de conteúdo.
 * @param {string[]} tokens
 * @param {Map<string,string>} wordlist lema -> nível
 * @param {Record<string,string>} [extraLevels] níveis para palavras fora da lista (vindos do LLM)
 */
export function wordLevelProfile(tokens, wordlist, extraLevels = {}) {
  const byLevel = Object.fromEntries(LEVELS.map((l) => [l, []]));
  const unknown = [];
  const seen = new Set();
  for (const t of tokens) {
    if (FUNCTION_WORDS.has(t) || FILLERS.has(t) || t.length < 2) continue;
    const cands = lemmaCandidates(t);
    const lemma = cands.find((c) => wordlist && wordlist.has(c));
    const key = lemma || t;
    if (seen.has(key)) continue;
    seen.add(key);
    const lvl = lemma ? wordlist.get(lemma) : extraLevels[t] || extraLevels[key];
    if (LEVELS.includes(lvl)) byLevel[lvl].push(key);
    else unknown.push(t);
  }
  const counted = LEVELS.reduce((n, l) => n + byLevel[l].length, 0);
  const b2plus = byLevel.B2.length + byLevel.C1.length + byLevel.C2.length;
  return {
    byLevel,
    unknown,
    contentLemmas: counted,
    pctB2plus: counted ? round1((b2plus / counted) * 100) : null,
  };
}

/**
 * Nota de vocabulário.
 * @param {object} p
 * @param {string} p.transcript
 * @param {Map<string,string>} p.wordlist
 * @param {object} p.analysis saída do LLM (ver prompts/analise-llm.md)
 */
export function scoreVocabulary({ transcript, wordlist, analysis = {} }) {
  const tokens = tokenize(transcript).filter((t) => !FILLERS.has(t));
  const n = tokens.length || 1;
  const lemmas = tokens.map((t) => {
    const c = lemmaCandidates(t);
    return (wordlist && c.find((x) => wordlist.has(x))) || t;
  });
  const m = mattr(lemmas);
  const profile = wordLevelProfile(tokens, wordlist, analysis.unknown_word_levels || {});
  const lexErrors = (analysis.lexical_errors || []).reduce((s, e) => s + (e.type === "portuguese" ? 2 : 1), 0);
  const lexPer100 = (lexErrors / n) * 100;
  const mwePer100 = ((analysis.multiword_expressions || []).length / n) * 100;
  const parts = {
    variety: scoreFromAnchors(m, ANCHORS.mattr),
    level: scoreFromAnchors(profile.pctB2plus, ANCHORS.pctB2plus),
    precision: scoreFromAnchors(lexPer100, ANCHORS.lexicalErrorsPer100),
    expressions: scoreFromAnchors(mwePer100, ANCHORS.expressionsPer100),
  };
  return {
    score: weightedMean(parts, SUB_WEIGHTS.vocabulary),
    parts,
    metrics: { mattr: m == null ? null : round1(m * 100) / 100, pctB2plus: profile.pctB2plus, lexicalErrorsPer100: round1(lexPer100), expressionsPer100: round1(mwePer100) },
    profile,
  };
}

/* ------------------------------------------------------------------ */
/* Fluência                                                            */
/* ------------------------------------------------------------------ */

/**
 * Métricas de fluência a partir dos tempos por palavra do reconhecimento de fala.
 * @param {{word:string,start:number,end:number}[]} words tempos em segundos
 * @param {object} [analysis] saída do LLM (usa `restarts`)
 */
export function fluencyMetrics(words, analysis = {}) {
  const w = (words || []).filter((x) => x && Number.isFinite(x.start) && Number.isFinite(x.end));
  if (w.length < 2) return null;
  // o tempo conta da primeira à última palavra (silêncio antes/depois não entra)
  const t0 = w[0].start, t1 = w[w.length - 1].end;
  const spanMin = Math.max(t1 - t0, 1) / 60;
  const plain = w.map((x) => x.word.toLowerCase().replace(/[^a-zà-ÿ']/g, ""));
  const lexical = plain.filter((x) => x && !FILLERS.has(x));

  let runs = 1, longPauses = 0;
  for (let i = 1; i < w.length; i++) {
    const gap = w[i].start - w[i - 1].end;
    if (gap >= RULES.shortPauseSec) runs++;
    if (gap >= RULES.longPauseSec) {
      const betweenClauses = /[.,!?;:]$/.test(w[i - 1].word);
      longPauses += betweenClauses ? 1 : 2; // pausa no meio da oração conta em dobro
    }
  }
  const fillers = plain.filter((x) => FILLERS.has(x)).length;
  let repeats = 0;
  for (let i = 1; i < lexical.length; i++) if (lexical[i] === lexical[i - 1] && !["had", "that"].includes(lexical[i])) repeats++;
  const restarts = Number(analysis.restarts) || 0;
  const n = lexical.length || 1;

  return {
    wordsPerMinute: round1(lexical.length / spanMin),
    meanLengthOfRun: round1(lexical.length / runs),
    longPausesPerMinute: round1(longPauses / spanMin),
    hesitationsPer100: round1(((fillers + repeats + restarts) / n) * 100),
    durationSec: round1(t1 - t0),
  };
}

export function scoreFluency(words, analysis) {
  const m = fluencyMetrics(words, analysis);
  if (!m) return { score: null, parts: {}, metrics: null };
  const parts = {
    speechRate: scoreFromAnchors(m.wordsPerMinute, ANCHORS.wordsPerMinute),
    meanLengthOfRun: scoreFromAnchors(m.meanLengthOfRun, ANCHORS.meanLengthOfRun),
    longPauses: scoreFromAnchors(m.longPausesPerMinute, ANCHORS.longPausesPerMinute),
    hesitations: scoreFromAnchors(m.hesitationsPer100, ANCHORS.hesitationsPer100),
  };
  return { score: weightedMean(parts, SUB_WEIGHTS.fluency), parts, metrics: m };
}

/* ------------------------------------------------------------------ */
/* Pronúncia                                                           */
/* ------------------------------------------------------------------ */

/**
 * @param {object} pron saída normalizada do motor de pronúncia
 * @param {number} pron.accuracy 0–100 (precisão de fonemas)
 * @param {number} [pron.stress] 0–100 (acento das palavras)
 * @param {number} [pron.prosody] 0–100 (entonação e ritmo)
 * @param {number} [pron.unintelligiblePer100]
 * Sem motor: passe { accuracy: média da confiança do ASR × 100, estimated: true }.
 */
export function scorePronunciation(pron) {
  if (!pron || pron.accuracy == null) return { score: null, parts: {}, estimated: true };
  const parts = {
    accuracy: scoreFromAnchors(pron.accuracy, ANCHORS.pronAccuracy),
    stress: pron.stress == null ? null : scoreFromAnchors(pron.stress, ANCHORS.pronAccuracy),
    prosody: pron.prosody == null ? null : scoreFromAnchors(pron.prosody, ANCHORS.pronAccuracy),
    intelligibility: pron.unintelligiblePer100 == null ? null : scoreFromAnchors(pron.unintelligiblePer100, ANCHORS.unintelligiblePer100),
  };
  return { score: weightedMean(parts, SUB_WEIGHTS.pronunciation), parts, estimated: !!pron.estimated };
}

/* ------------------------------------------------------------------ */
/* Gramática                                                           */
/* ------------------------------------------------------------------ */

/** Nota de variedade: o maior nível com pelo menos 2 estruturas distintas daquele nível ou acima. */
export function structureVarietyScore(structures = []) {
  const lv = [...new Set(structures)].map((s) => STRUCTURES[s]).filter(Boolean).map(levelIndex);
  if (!lv.length) return ANCHOR_SCORES[0] / 2;
  let best = -1;
  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (lv.filter((x) => x >= i).length >= 2) { best = i; break; }
  }
  if (best < 0) return ANCHOR_SCORES[0];
  const oneAbove = lv.some((x) => x > best);
  const next = ANCHOR_SCORES[Math.min(best + 1, LEVELS.length - 1)];
  return round1(oneAbove ? (ANCHOR_SCORES[best] + next) / 2 : ANCHOR_SCORES[best]);
}

export function scoreGrammar({ transcript, analysis = {} }) {
  const n = tokenize(transcript).filter((t) => !FILLERS.has(t)).length || 1;
  const errs = (analysis.grammar_errors || []).reduce((s, e) => s + (e.impedes ? 2 : 1), 0);
  const per100 = (errs / n) * 100;
  const tunits = Number(analysis.t_units) || null;
  const wpt = tunits ? n / tunits : null;
  const parts = {
    errors: scoreFromAnchors(per100, ANCHORS.grammarErrorsPer100),
    complexity: wpt == null ? null : scoreFromAnchors(wpt, ANCHORS.wordsPerTUnit),
    variety: structureVarietyScore(analysis.structures),
  };
  return {
    score: weightedMean(parts, SUB_WEIGHTS.grammar),
    parts,
    metrics: { grammarErrorsPer100: round1(per100), wordsPerTUnit: wpt == null ? null : round1(wpt), structures: analysis.structures || [] },
  };
}

/* ------------------------------------------------------------------ */
/* Combinação                                                          */
/* ------------------------------------------------------------------ */

/**
 * Aplica pesos, teto pela dimensão mais fraca e devolve o nível.
 * @param {{pronunciation:number|null,fluency:number|null,grammar:number|null,vocabulary:number|null}} dims
 */
export function combine(dims, weights = DIMENSION_WEIGHTS) {
  const raw = weightedMean(dims, weights);
  if (raw == null) return { raw: null, final: null, level: null, capped: false };
  const present = Object.entries(dims).filter(([, v]) => v != null);
  const weakest = present.reduce((a, b) => (b[1] < a[1] ? b : a));
  const weakestIdx = levelIndex(levelFromScore(weakest[1]).level);
  const ceilIdx = Math.min(weakestIdx + 1, LEVELS.length - 1);
  let final = raw, capped = false;
  if (levelIndex(levelFromScore(raw).level) > ceilIdx) {
    final = BANDS[ceilIdx].max;
    capped = true;
  }
  return {
    raw,
    final: round1(final),
    ...levelFromScore(final),
    capped,
    cappedBy: capped ? weakest[0] : null,
    dimensionLevels: Object.fromEntries(present.map(([k, v]) => [k, levelFromScore(v).label])),
  };
}

/**
 * Avalia UMA resposta.
 * @param {object} input
 * @param {string} input.transcript
 * @param {{word:string,start:number,end:number}[]} [input.words] tempos do ASR
 * @param {object} [input.pronunciation] ver scorePronunciation
 * @param {object} [input.analysis] JSON devolvido pelo LLM
 * @param {Map<string,string>} [input.wordlist]
 * @param {string} [input.taskType] describe | narrate | opinion | argument | ...
 */
export function assessResponse(input) {
  const { transcript = "", words, pronunciation, analysis = {}, wordlist = new Map(), taskType = null } = input;
  const nWords = tokenize(transcript).filter((t) => !FILLERS.has(t)).length;

  const vocabulary = scoreVocabulary({ transcript, wordlist, analysis });
  const grammar = scoreGrammar({ transcript, analysis });
  const fluency = scoreFluency(words, analysis);
  const pron = scorePronunciation(pronunciation);

  const dims = { pronunciation: pron.score, fluency: fluency.score, grammar: grammar.score, vocabulary: vocabulary.score };
  const result = combine(dims);

  const flags = [];
  if (nWords < RULES.minWordsPerResponse) flags.push("amostra_curta");
  if (fluency.metrics && fluency.metrics.wordsPerMinute > RULES.readAloudWpm && fluency.metrics.hesitationsPer100 === 0 && analysis.on_topic === false) flags.push("possivel_leitura");
  if (analysis.on_topic === false) flags.push("fora_do_tema");
  if (pron.estimated) flags.push("pronuncia_estimada");
  if (fluency.score == null) flags.push("sem_tempos_de_fala");

  const countsForLevel = !flags.includes("amostra_curta") && !flags.includes("possivel_leitura");
  return {
    words: nWords,
    taskType,
    dimensions: dims,
    details: { vocabulary, grammar, fluency, pronunciation: pron },
    ...result,
    // nível de uma resposta isolada é só indicativo
    indicativeLevel: result.label,
    countsForLevel,
    flags,
  };
}

/**
 * Avalia uma SESSÃO (várias respostas) e decide o nível oficial.
 * Média das dimensões ponderada pelo número de palavras de cada resposta.
 */
export function assessSession(responses) {
  const valid = responses.filter((r) => r.countsForLevel);
  const totalWords = valid.reduce((s, r) => s + r.words, 0);
  const tasks = new Set(valid.map((r) => r.taskType).filter(Boolean));
  const reasons = [];
  if (valid.length < RULES.minResponsesPerSession) reasons.push(`precisa de ${RULES.minResponsesPerSession} respostas válidas (tem ${valid.length})`);
  if (totalWords < RULES.minWordsPerSession) reasons.push(`precisa de ${RULES.minWordsPerSession} palavras (tem ${totalWords})`);
  if (tasks.size < RULES.minDistinctTasks) reasons.push(`precisa de ${RULES.minDistinctTasks} tipos de tarefa diferentes (tem ${tasks.size})`);

  const dims = {};
  for (const k of Object.keys(DIMENSION_WEIGHTS)) {
    let s = 0, w = 0;
    for (const r of valid) if (r.dimensions[k] != null) { s += r.dimensions[k] * r.words; w += r.words; }
    dims[k] = w ? round1(s / w) : null;
  }
  let result = combine(dims);
  let gated = false;
  const gateIdx = levelIndex(RULES.argumentRequiredFromLevel);
  if (result.level && levelIndex(result.level) >= gateIdx && !tasks.has("argument")) {
    result = { ...result, final: BANDS[gateIdx - 1].max, ...levelFromScore(BANDS[gateIdx - 1].max) };
    gated = true;
  }
  return {
    official: reasons.length === 0,
    reasons,
    dimensions: dims,
    ...result,
    gatedByTask: gated,
    totalWords,
    tasks: [...tasks],
  };
}

/**
 * Histerese: o nível do perfil só muda após N sessões seguidas acima (ou abaixo).
 * @param {{level:string|null, history:string[]}} profile history = níveis das sessões oficiais, mais recente no fim
 * @param {string} sessionLevel nível da nova sessão oficial (ex.: "B1")
 */
export function updateProfileLevel(profile, sessionLevel) {
  const history = [...(profile.history || []), sessionLevel].slice(-20);
  let level = profile.level;
  const N = RULES.hysteresisSessions;
  if (!level) {
    // primeira definição: mediana das primeiras N sessões
    if (history.length >= N) {
      const idx = history.slice(-N).map(levelIndex).sort((a, b) => a - b);
      level = LEVELS[idx[Math.floor(idx.length / 2)]];
    }
  } else if (history.length >= N) {
    const last = history.slice(-N).map(levelIndex);
    const cur = levelIndex(level);
    if (last.every((x) => x > cur)) level = LEVELS[Math.min(...last)];
    else if (last.every((x) => x < cur)) level = LEVELS[Math.max(...last)];
  }
  return { level, history };
}
