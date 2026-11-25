// Rodar com: npm test  (ou: node --test)
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as E from "../src/cefr-engine.js";
import { EXAMPLES, synthTimings } from "../fixtures/examples.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, "..", "data", f), "utf8");
const wordlist = E.mergeWordlists(
  E.parseWordlistCsv(read("cefrj-vocabulary-profile-1.5.csv")),
  E.parseWordlistCsv(read("octanove-vocabulary-profile-c1c2-1.0.csv")),
);
const assess = (ex) => E.assessResponse({ ...ex, words: synthTimings(ex.transcript, ex.audio), wordlist });

test("lista de palavras carrega e resolve formas flexionadas", () => {
  assert.ok(wordlist.size > 8000);
  assert.equal(wordlist.get("beach"), "A1");
  const p = E.wordLevelProfile(["beaches", "traveled", "breathtaking"], wordlist);
  assert.ok(p.byLevel.A1.includes("beach"));
});

for (const ex of EXAMPLES) {
  test(`exemplo do documento ${ex.expected} recebe nível ${ex.expected}`, () => {
    const r = assess(ex);
    assert.equal(r.level, ex.expected, JSON.stringify({ raw: r.raw, dims: r.dimensions }));
  });
}

test("respostas curtas são marcadas e não contam para o nível oficial", () => {
  const r = assess(EXAMPLES[0]);
  assert.ok(r.flags.includes("amostra_curta"));
  assert.equal(r.countsForLevel, false);
});

test("interpolação: âncora exata dá o centro da faixa; métricas decrescentes funcionam", () => {
  assert.equal(E.scoreFromAnchors(100, E.ANCHORS.wordsPerMinute), 50);
  assert.equal(E.scoreFromAnchors(7, E.ANCHORS.grammarErrorsPer100), 50);
  assert.equal(E.scoreFromAnchors(0, E.ANCHORS.grammarErrorsPer100), 100);
  assert.equal(E.scoreFromAnchors(40, E.ANCHORS.grammarErrorsPer100), 0);
});

test("subnível: metade de cima da faixa ganha +", () => {
  assert.equal(E.levelFromScore(45).label, "B1");
  assert.equal(E.levelFromScore(52).label, "B1+");
  assert.equal(E.levelFromScore(95).label, "C2");
});

test("teto: nível final no máximo 1 acima da dimensão mais fraca", () => {
  const r = E.combine({ pronunciation: 85, fluency: 70, grammar: 70, vocabulary: 30 }); // média 63,75 = B2
  assert.equal(r.level, "B1");
  assert.equal(r.capped, true);
  assert.equal(r.cappedBy, "vocabulary");
});

test("sessão: exige 3 tarefas, 150 palavras e tarefa argumentativa para B2+", () => {
  const [, , b1, b2, c1] = EXAMPLES.map(assess);
  const opinion = { ...c1, taskType: "opinion" };
  const describe = { ...b2, taskType: "describe" };

  const semArgumento = E.assessSession([b1, describe, opinion]);
  assert.equal(semArgumento.official, true);
  assert.equal(semArgumento.gatedByTask, true);
  assert.equal(semArgumento.level, "B1");

  const comArgumento = E.assessSession([b1, b2, opinion]);
  assert.equal(comArgumento.gatedByTask, false);
  assert.ok(E.levelIndex(comArgumento.level) >= E.levelIndex("B2"));

  const curta = E.assessSession([b1]);
  assert.equal(curta.official, false);
  assert.ok(curta.reasons.length >= 2);
});

test("histerese: nível só muda após 3 sessões seguidas", () => {
  let p = { level: null, history: [] };
  for (const l of ["B1", "B1", "A2"]) p = E.updateProfileLevel(p, l);
  assert.equal(p.level, "B1");
  for (const l of ["B2", "B2"]) p = E.updateProfileLevel(p, l);
  assert.equal(p.level, "B1");
  p = E.updateProfileLevel(p, "C1");
  assert.equal(p.level, "B2");
  p = E.updateProfileLevel(p, "A2");
  assert.equal(p.level, "B2");
});

test("fluência: pausa longa no meio da oração conta em dobro", () => {
  const w = (word, start, end) => ({ word, start, end });
  const meio = E.fluencyMetrics([w("I", 0, 0.2), w("went", 1.5, 1.8), w("home.", 1.9, 2.2), w("Then", 2.3, 2.5)]);
  const fim = E.fluencyMetrics([w("I", 0, 0.2), w("went", 0.3, 0.6), w("home.", 0.7, 1.0), w("Then", 2.3, 2.5)]);
  assert.ok(meio.longPausesPerMinute > fim.longPausesPerMinute);
});

test("palavra em português conta como 2 erros de vocabulário", () => {
  const t = Array(60).fill("word").join(" ");
  const a = E.scoreVocabulary({ transcript: t, wordlist, analysis: { lexical_errors: [{ type: "portuguese" }] } });
  const b = E.scoreVocabulary({ transcript: t, wordlist, analysis: { lexical_errors: [{ type: "wrong_word" }] } });
  assert.ok(a.metrics.lexicalErrorsPer100 > b.metrics.lexicalErrorsPer100);
});
