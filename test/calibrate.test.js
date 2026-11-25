import { test } from "node:test";
import assert from "node:assert/strict";
import { assessResponse, ANCHORS } from "../src/cefr-engine.js";
import { loadWordlist } from "../server/wordlist.js";
import { EXAMPLES, synthTimings } from "../fixtures/examples.js";
import { agreement, medians, suggestAnchors, formatReport, median } from "../scripts/calibrate-lib.js";

const wordlist = loadWordlist();
const items = EXAMPLES.map((ex) => ({
  file: ex.expected + ".json",
  teacherLevel: ex.expected,
  pronunciation: ex.pronunciation,
  result: assessResponse({ ...ex, words: synthTimings(ex.transcript, ex.audio), wordlist }),
}));

test("mediana", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([null, NaN]), null);
});

test("concordância e matriz de confusão: os seis exemplos batem com o nível esperado", () => {
  const a = agreement(items);
  assert.equal(a.n, 6);
  assert.equal(a.exact, 6);
  assert.equal(a.within1Pct, 1);
  assert.equal(a.matrix.B1.B1, 1);
  const off = agreement([{ teacherLevel: "B2", result: { level: "B1" } }, { teacherLevel: "A1", result: { level: "B1" } }]);
  assert.equal(off.exact, 0);
  assert.equal(off.within1, 1);
  assert.equal(off.matrix.A1.B1, 1);
});

test("medianas por nível ficam ao lado da âncora atual, para todas as métricas de ANCHORS", () => {
  const m = medians(items);
  assert.deepEqual(Object.keys(m).sort(), Object.keys(ANCHORS).sort());
  const wpmB1 = m.wordsPerMinute.find((r) => r.level === "B1");
  assert.equal(wpmB1.anchor, 100);
  assert.ok(Math.abs(wpmB1.median - 100) < 10, String(wpmB1.median));
  assert.equal(m.pronAccuracy.find((r) => r.level === "C1").median, 85);
});

test("sugestão: só propõe, lista diferenças > 15% e não toca em ANCHORS", () => {
  const before = JSON.stringify(ANCHORS);
  const m = medians(items);
  const s = suggestAnchors(m);
  assert.equal(JSON.stringify(ANCHORS), before);
  for (const d of s.diffs) assert.ok(d.pct == null || Math.abs(d.pct) > 15, JSON.stringify(d));
  assert.equal(s.suggested.pronAccuracy[4], 85);
  const txt = formatReport({ items, agree: agreement(items), med: m, sugg: s });
  assert.match(txt, /Concordância exata com o professor: 6\/6 \(100%\)/);
  assert.match(txt, /Matriz de confusão/);
  assert.match(txt, /ANCHORS não foi alterado/);
});
