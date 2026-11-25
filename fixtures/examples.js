// Os seis exemplos do documento, com a saída esperada do LLM e dados sintéticos de áudio.
// Servem de casos de teste: o motor deve classificá-los no nível que o documento indica.

/**
 * Gera tempos por palavra que reproduzem uma velocidade, um trecho médio sem pausa
 * e um número de pausas longas por minuto.
 */
export function synthTimings(transcript, { wpm, mlr, longPausesPerMin }) {
  const toks = transcript.split(/\s+/).filter(Boolean);
  const lexical = toks.filter((t) => !/^(uh|um|er|éé)[.,]?$/i.test(t)).length;
  const totalSec = (lexical / wpm) * 60;
  const runs = Math.max(1, Math.round(lexical / mlr));
  const gaps = runs - 1;
  const longGaps = Math.min(gaps, Math.round((longPausesPerMin * totalSec) / 60));
  const pauseSec = longGaps * 1.2 + (gaps - longGaps) * 0.35;
  const wordSec = Math.max(0.12, (totalSec - pauseSec) / toks.length);
  const every = toks.length / runs;
  const out = [];
  let t = 0, g = 0, nextBreak = every;
  toks.forEach((w, i) => {
    out.push({ word: w, start: +t.toFixed(3), end: +(t + wordSec).toFixed(3) });
    t += wordSec;
    if (i + 1 >= nextBreak && g < gaps) {
      t += g < longGaps ? 1.2 : 0.35;
      g++;
      nextBreak += every;
    }
  });
  return out;
}

export const EXAMPLES = [
  {
    expected: "A1",
    taskType: "narrate",
    transcript: "Vacation uh I go beach. Is very good. My family uh I like sun. Yes. Go back yes.",
    audio: { wpm: 48, mlr: 1.8, longPausesPerMin: 12 },
    pronunciation: { accuracy: 45, stress: 40, prosody: 40, unintelligiblePer100: 12 },
    analysis: {
      on_topic: true,
      grammar_errors: [
        { text: "I go beach", correction: "I went to the beach", type: "verb_tense", impedes: false },
        { text: "go beach", correction: "go to the beach", type: "preposition", impedes: false },
        { text: "Is very good", correction: "It was very good", type: "missing_subject", impedes: false },
        { text: "Go back yes", correction: "Yes, I would go back", type: "missing_subject", impedes: true },
      ],
      lexical_errors: [],
      multiword_expressions: [],
      structures: ["present_simple"],
      t_units: 6,
      restarts: 1,
      unknown_word_levels: {},
    },
  },
  {
    expected: "A2",
    taskType: "narrate",
    transcript:
      "My last vacation I went to the beach with my family. It was very nice because the weather was hot. We eat fish and we swim in the sea. I want to go back because is beautiful.",
    audio: { wpm: 78, mlr: 3, longPausesPerMin: 8 },
    pronunciation: { accuracy: 60, stress: 58, prosody: 55, unintelligiblePer100: 5 },
    analysis: {
      on_topic: true,
      grammar_errors: [
        { text: "We eat fish", correction: "We ate fish", type: "verb_tense", impedes: false },
        { text: "we swim", correction: "we swam", type: "verb_tense", impedes: false },
        { text: "because is beautiful", correction: "because it is beautiful", type: "missing_subject", impedes: false },
        { text: "My last vacation I went", correction: "On my last vacation I went", type: "preposition", impedes: false },
      ],
      lexical_errors: [],
      multiword_expressions: [],
      structures: ["past_simple", "because_so_clauses", "present_simple"],
      t_units: 5,
      restarts: 1,
      unknown_word_levels: {},
    },
  },
  {
    expected: "B1",
    taskType: "narrate",
    transcript:
      "Last year I traveled to Salvador with some friends. We stayed there for one week and we visited a lot of places, like the old town and some beaches. The food was amazing, but it was very crowded, so sometimes it was difficult to relax. I think I would go back, but maybe in a different season.",
    audio: { wpm: 100, mlr: 5, longPausesPerMin: 6 },
    pronunciation: { accuracy: 70, stress: 68, prosody: 66, unintelligiblePer100: 3 },
    analysis: {
      on_topic: true,
      grammar_errors: [{ text: "for one week", correction: "for a week", type: "article", impedes: false }],
      lexical_errors: [],
      multiword_expressions: [{ text: "a lot of", cefr: "A2" }],
      structures: ["past_simple", "because_so_clauses", "second_conditional", "present_simple", "gerund_infinitive_patterns"],
      t_units: 7,
      restarts: 1,
      unknown_word_levels: {},
    },
  },
  {
    expected: "B2",
    taskType: "argument",
    transcript:
      "My last vacation was actually a short trip to Chile in July. I'd always wanted to see snow, so we spent a couple of days skiing near Santiago, which was harder than I expected. The landscapes were breathtaking, although the prices were quite high compared to Brazil. Would I go back? Definitely, but I'd probably plan the budget more carefully next time.",
    audio: { wpm: 120, mlr: 7, longPausesPerMin: 4 },
    pronunciation: { accuracy: 77, stress: 76, prosody: 74, unintelligiblePer100: 2 },
    analysis: {
      on_topic: true,
      grammar_errors: [],
      lexical_errors: [],
      multiword_expressions: [{ text: "a couple of", cefr: "B1" }, { text: "compared to", cefr: "B1" }],
      structures: ["past_perfect", "relative_clauses_non_defining", "although_despite_contrast", "comparatives", "second_conditional", "past_simple"],
      t_units: 6,
      restarts: 0,
      unknown_word_levels: { breathtaking: "B2", budget: "B2" },
    },
  },
  {
    expected: "C1",
    taskType: "argument",
    transcript:
      "The last proper holiday I had was a road trip through Patagonia, which, to be honest, turned out to be far more demanding than I'd anticipated. We'd underestimated the distances, so we ended up driving for hours on gravel roads with hardly any signal. That said, the sheer scale of the place made up for it. I'd go back in a heartbeat, though I'd take a sturdier car.",
    audio: { wpm: 136, mlr: 9, longPausesPerMin: 2 },
    pronunciation: { accuracy: 85, stress: 84, prosody: 83, unintelligiblePer100: 1 },
    analysis: {
      on_topic: true,
      grammar_errors: [],
      lexical_errors: [],
      multiword_expressions: [
        { text: "to be honest", cefr: "B1" }, { text: "turned out", cefr: "B2" }, { text: "ended up", cefr: "B2" },
        { text: "that said", cefr: "C1" }, { text: "made up for", cefr: "C1" }, { text: "in a heartbeat", cefr: "C1" },
      ],
      structures: ["past_perfect", "relative_clauses_non_defining", "second_conditional", "comparatives", "advanced_hedging", "participle_clauses"],
      t_units: 5,
      restarts: 0,
      unknown_word_levels: { sheer: "C1", sturdier: "C1", anticipated: "B2", underestimated: "C1", gravel: "C1" },
    },
  },
  {
    expected: "C2",
    taskType: "argument",
    transcript:
      "I suppose my last real break was a fortnight in Lisbon, which I'd somewhat romanticised beforehand, so I was half expecting to be let down. Quite the opposite, as it happens: what struck me wasn't so much the sights as the pace of life, that unhurried way people linger over lunch. Would I go back? Without hesitation, although I'd be tempted to rent a flat and stay long enough to stop feeling like a tourist.",
    audio: { wpm: 152, mlr: 11.5, longPausesPerMin: 0.5 },
    pronunciation: { accuracy: 92, stress: 91, prosody: 90, unintelligiblePer100: 0.2 },
    analysis: {
      on_topic: true,
      grammar_errors: [],
      lexical_errors: [],
      multiword_expressions: [
        { text: "let down", cefr: "B2" }, { text: "quite the opposite", cefr: "C1" }, { text: "as it happens", cefr: "C1" },
        { text: "not so much X as Y", cefr: "C2" }, { text: "pace of life", cefr: "B2" }, { text: "without hesitation", cefr: "C1" },
        { text: "long enough to", cefr: "B1" },
      ],
      structures: ["cleft_sentences", "past_perfect", "relative_clauses_non_defining", "advanced_hedging", "ellipsis_substitution", "fronting_for_emphasis", "although_despite_contrast"],
      t_units: 5,
      restarts: 0,
      unknown_word_levels: { fortnight: "C1", romanticised: "C2", unhurried: "C2", linger: "C2", tempted: "B2", hesitation: "B2" },
    },
  },
];
