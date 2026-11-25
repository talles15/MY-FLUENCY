import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizeAzure } from "../server/normalize-azure.js";
import { fluencyMetrics } from "../src/cefr-engine.js";

const fixture = JSON.parse(fs.readFileSync(new URL("../fixtures/azure-unscripted.json", import.meta.url)));

test("normaliza a resposta do Azure: palavras com tempos em segundos e pontuação do texto exibido", () => {
  const r = normalizeAzure(fixture);
  assert.equal(r.words.length, 48);
  assert.deepEqual(r.words[0], { word: "Last", start: 0.66, end: 0.84 });
  assert.equal(r.words[1].word, "year,", "pontuação vinda do DisplayText");
  assert.equal(r.words[3].word, "twenty", "número por extenso fica na forma lexical quando o Display mostra dígitos");
  assert.ok(r.words.some((w) => w.word === "friends."));
  for (let i = 1; i < r.words.length; i++) assert.ok(r.words[i].start >= r.words[i - 1].end, "tempos em ordem");
  assert.match(r.transcript, /^Last year, in twenty nineteen I traveled/);
});

test("pronúncia: média ponderada por trecho, prosódia, acento e ininteligíveis por 100 palavras", () => {
  const p = normalizeAzure(fixture).pronunciation;
  assert.equal(p.accuracy, 75); // (78×12 + 74×36) / 48
  assert.equal(p.prosody, 69.8); // (72×12 + 69×36) / 48
  assert.equal(p.unintelligiblePer100, 4.2); // 2 palavras < 40 em 48
  assert.equal(p.stress, 93.8); // 45 de 48 sem erro de entonação
  assert.equal(p.estimated, undefined);
});

test("os tempos alimentam a fluência do motor (pausa longa detectada)", () => {
  const m = fluencyMetrics(normalizeAzure(fixture).words);
  assert.ok(m.wordsPerMinute > 60 && m.wordsPerMinute < 200, String(m.wordsPerMinute));
  assert.ok(m.longPausesPerMinute > 0);
});

test("sem avaliação de pronúncia, usa a confiança do ASR como estimativa", () => {
  const seg = structuredClone(fixture[0]);
  delete seg.NBest[0].PronunciationAssessment;
  for (const w of seg.NBest[0].Words) { delete w.PronunciationAssessment; }
  const p = normalizeAzure(seg).pronunciation;
  assert.equal(p.accuracy, 93);
  assert.equal(p.estimated, true);
  assert.equal(p.stress, null);
});

test("resposta vazia ou sem fala vira pronunciation null", () => {
  assert.equal(normalizeAzure([]).pronunciation, null);
  assert.equal(normalizeAzure([{ RecognitionStatus: "NoMatch" }]).words.length, 0);
});
