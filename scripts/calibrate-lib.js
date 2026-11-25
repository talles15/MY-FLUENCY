// Cálculos da calibração (sem rede): concordância, matriz de confusão, medianas por nível e sugestão de âncoras.
import { ANCHORS, LEVELS, levelIndex } from "../src/cefr-engine.js";

/** Onde cada métrica de ANCHORS aparece na saída do pipeline. */
export const METRIC_SOURCES = {
  mattr: (r) => r.result.details.vocabulary.metrics.mattr,
  pctB2plus: (r) => r.result.details.vocabulary.metrics.pctB2plus,
  lexicalErrorsPer100: (r) => r.result.details.vocabulary.metrics.lexicalErrorsPer100,
  expressionsPer100: (r) => r.result.details.vocabulary.metrics.expressionsPer100,
  pronAccuracy: (r) => r.pronunciation && r.pronunciation.accuracy,
  unintelligiblePer100: (r) => r.pronunciation && r.pronunciation.unintelligiblePer100,
  wordsPerMinute: (r) => r.result.details.fluency.metrics && r.result.details.fluency.metrics.wordsPerMinute,
  meanLengthOfRun: (r) => r.result.details.fluency.metrics && r.result.details.fluency.metrics.meanLengthOfRun,
  longPausesPerMinute: (r) => r.result.details.fluency.metrics && r.result.details.fluency.metrics.longPausesPerMinute,
  hesitationsPer100: (r) => r.result.details.fluency.metrics && r.result.details.fluency.metrics.hesitationsPer100,
  grammarErrorsPer100: (r) => r.result.details.grammar.metrics.grammarErrorsPer100,
  wordsPerTUnit: (r) => r.result.details.grammar.metrics.wordsPerTUnit,
};

export const DIFF_THRESHOLD = 0.15;

export function median(xs) {
  const v = xs.filter((x) => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);

/**
 * @param {{teacherLevel:string, result:object, pronunciation:object|null}[]} items
 */
export function agreement(items) {
  const matrix = Object.fromEntries(LEVELS.map((t) => [t, Object.fromEntries(LEVELS.map((m) => [m, 0]))]));
  let exact = 0, within1 = 0, n = 0;
  for (const it of items) {
    const t = it.teacherLevel, m = it.result.level;
    if (!LEVELS.includes(t) || !LEVELS.includes(m)) continue;
    n++;
    matrix[t][m]++;
    const d = Math.abs(levelIndex(t) - levelIndex(m));
    if (d === 0) exact++;
    if (d <= 1) within1++;
  }
  return { n, exact, within1, exactPct: n ? exact / n : null, within1Pct: n ? within1 / n : null, matrix };
}

/** Mediana observada de cada métrica para cada nível do professor, ao lado da âncora atual. */
export function medians(items) {
  const out = {};
  for (const [metric, get] of Object.entries(METRIC_SOURCES)) {
    out[metric] = LEVELS.map((lvl, i) => {
      const vals = items.filter((it) => it.teacherLevel === lvl).map(get);
      return { level: lvl, anchor: ANCHORS[metric][i], median: r2(median(vals)), n: vals.filter((v) => v != null && Number.isFinite(v)).length };
    });
  }
  return out;
}

/**
 * Sugestão de âncoras: a mediana observada onde houver dados; a âncora atual onde não houver.
 * NÃO altera ANCHORS — só devolve a proposta e as diferenças maiores que o limite.
 */
export function suggestAnchors(med, threshold = DIFF_THRESHOLD) {
  const suggested = {}, diffs = [], warnings = [];
  for (const [metric, rows] of Object.entries(med)) {
    suggested[metric] = rows.map((r) => (r.median == null ? r.anchor : r.median));
    for (const r of rows) {
      if (r.median == null) continue;
      const pct = r.anchor === 0 ? (r.median === 0 ? 0 : Infinity) : (r.median - r.anchor) / Math.abs(r.anchor);
      if (Math.abs(pct) > threshold) diffs.push({ metric, level: r.level, current: r.anchor, suggested: r.median, pct: Number.isFinite(pct) ? Math.round(pct * 1000) / 10 : null, n: r.n });
    }
    const s = suggested[metric], cur = ANCHORS[metric];
    const desc = cur[0] > cur[cur.length - 1];
    const monotone = s.every((v, i) => i === 0 || (desc ? v <= s[i - 1] : v >= s[i - 1]));
    if (!monotone) warnings.push(`${metric}: a sugestão não é ${desc ? "decrescente" : "crescente"} de A1 a C2 (${s.join(", ")}) — o motor precisa de âncoras em ordem; ajuste à mão.`);
  }
  diffs.sort((a, b) => Math.abs(b.pct ?? 1e9) - Math.abs(a.pct ?? 1e9));
  return { suggested, diffs, warnings };
}

/* ---------------- texto do relatório ---------------- */

const pad = (s, n) => String(s).padStart(n);
const fmt = (v) => (v == null ? "—" : String(Math.round(v * 100) / 100).replace(".", ","));

export function formatReport({ items, agree, med, sugg, failures = [] }) {
  const L = [];
  L.push(`Calibração: ${items.length} amostra(s) avaliada(s)` + (failures.length ? `, ${failures.length} com erro` : ""));
  for (const f of failures) L.push(`  ✗ ${f.file}: ${f.error}`);
  L.push("");
  if (!agree.n) { L.push("Nenhuma amostra com nível do professor e nível do motor."); return L.join("\n"); }
  L.push(`Concordância exata com o professor: ${agree.exact}/${agree.n} (${Math.round(agree.exactPct * 100)}%)`);
  L.push(`Concordância com ±1 nível:          ${agree.within1}/${agree.n} (${Math.round(agree.within1Pct * 100)}%)`);
  L.push("");
  L.push("Matriz de confusão (linhas = professor, colunas = motor)");
  L.push("      " + LEVELS.map((l) => pad(l, 4)).join(""));
  for (const t of LEVELS) L.push(pad(t, 4) + "  " + LEVELS.map((m) => pad(agree.matrix[t][m] || "·", 4)).join(""));
  L.push("");
  L.push("Mediana observada por nível do professor [âncora atual] (n)");
  L.push(" ".repeat(22) + LEVELS.map((l) => pad(l, 17)).join(""));
  for (const [metric, rows] of Object.entries(med)) {
    L.push(metric.padEnd(22) + rows.map((r) => pad(`${fmt(r.median)} [${fmt(r.anchor)}] (${r.n})`, 17)).join(""));
  }
  L.push("");
  if (sugg.diffs.length) {
    L.push(`Diferenças maiores que ${Math.round(DIFF_THRESHOLD * 100)}% entre a mediana e a âncora atual (para você decidir):`);
    for (const d of sugg.diffs) L.push(`  ${d.metric.padEnd(22)} ${d.level}: ${fmt(d.current)} → ${fmt(d.suggested)}  (${d.pct == null ? "âncora 0" : (d.pct > 0 ? "+" : "") + String(d.pct).replace(".", ",") + "%"}, n=${d.n})`);
  } else L.push(`Nenhuma diferença maior que ${Math.round(DIFF_THRESHOLD * 100)}%.`);
  for (const w of sugg.warnings) L.push("  ⚠ " + w);
  L.push("");
  L.push("ANCHORS não foi alterado. A proposta completa está em data/calibracao/sugestao-ancoras.json.");
  return L.join("\n");
}
