import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createApp } from "../server/app.js";
import { toWav16kMono, wavSeconds } from "../server/audio.js";
import { loadWordlist } from "../server/wordlist.js";
import { EXAMPLES } from "../fixtures/examples.js";
import { listen, makeWebm, form } from "./helpers.js";

const azureFixture = JSON.parse(fs.readFileSync(new URL("../fixtures/azure-unscripted.json", import.meta.url)));
const wordlist = loadWordlist();
const b1Analysis = EXAMPLES[2].analysis;
const fakeAnalyze = (analysis = b1Analysis) => {
  const calls = [];
  const fn = async (args) => { calls.push(args); return { ...analysis, cefr: "C2" }; };
  fn.calls = calls;
  return fn;
};

test("GET /api/health informa quais serviços estão configurados", async () => {
  const s = await listen(createApp({ speech: { assess: async () => [] } }));
  try {
    const r = await fetch(s.url + "/api/health").then((x) => x.json());
    assert.deepEqual(r.services, { speech: true, llm: false, db: false });
  } finally { await s.close(); }
});

test("ffmpeg converte WebM/Opus em WAV PCM 16 kHz mono", async () => {
  const wav = await toWav16kMono(makeWebm(2));
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt16LE(22), 1, "mono");
  assert.equal(wav.readUInt32LE(24), 16000, "16 kHz");
  assert.equal(wav.readUInt16LE(34), 16, "16 bits");
  assert.ok(Math.abs(wavSeconds(wav) - 2) < 0.1);
});

test("POST /api/assess com áudio: Azure -> Claude -> motor; o nível vem só do motor", async () => {
  let got = null;
  const speech = { assess: async (wav, opts) => { got = { wav, opts }; return azureFixture; } };
  const analyze = fakeAnalyze();
  const s = await listen(createApp({ speech, analyze, wordlist }));
  try {
    const r = await fetch(s.url + "/api/assess", { method: "POST", body: form({ question: "Tell me about a trip.", taskType: "narrate" }, makeWebm(1)) }).then((x) => x.json());
    assert.equal(got.wav.readUInt32LE(24), 16000);
    assert.equal(got.opts.referenceText, undefined, "modo sem roteiro");
    assert.equal(analyze.calls[0].question, "Tell me about a trip.");
    assert.match(analyze.calls[0].transcript, /^Last year, in twenty nineteen/);
    assert.equal(r.result.details.fluency.metrics.durationSec > 0, true, "fluência a partir dos tempos do Azure");
    assert.equal(r.analysis.cefr, "C2", "o servidor repassa o que o analisador devolveu…");
    assert.notEqual(r.result.level, "C2", "…mas o nível é do motor");
    assert.ok(["A2", "B1", "B2"].includes(r.result.level), r.result.level);
    assert.ok(!r.result.flags.includes("pronuncia_estimada"));
  } finally { await s.close(); }
});

test("POST /api/assess: se o Azure falhar, segue sem pronúncia (flag pronuncia_estimada)", async () => {
  const speech = { assess: async () => { throw new Error("401 Unauthorized"); } };
  const s = await listen(createApp({ speech, analyze: fakeAnalyze(), wordlist }));
  try {
    const ok = await fetch(s.url + "/api/assess", { method: "POST", body: form({ taskType: "narrate", fallbackTranscript: EXAMPLES[2].transcript }, makeWebm(1)) });
    const r = await ok.json();
    assert.equal(ok.status, 200);
    assert.equal(r.pronunciation, null);
    assert.equal(r.transcriptSource, "browser");
    assert.ok(r.result.flags.includes("pronuncia_estimada"));
    assert.ok(r.result.flags.includes("sem_tempos_de_fala"));
    assert.match(r.speechError, /401/);

    const fail = await fetch(s.url + "/api/assess", { method: "POST", body: form({ taskType: "describe" }, makeWebm(1)) });
    assert.equal(fail.status, 502);
    assert.match((await fail.json()).error, /transcrever/);
  } finally { await s.close(); }
});

test("POST /api/assess: erro do analisador vira 502 com mensagem legível", async () => {
  const analyze = async () => { const e = new Error("A análise veio num formato inválido duas vezes."); e.status = 502; throw e; };
  const s = await listen(createApp({ analyze, wordlist }));
  try {
    const r = await fetch(s.url + "/api/assess", { method: "POST", body: form({ taskType: "describe", text: "I live in a small town near the sea." }) });
    assert.equal(r.status, 502);
    assert.match((await r.json()).error, /formato inválido/);
  } finally { await s.close(); }
});

test("POST /api/assess valida taskType e exige áudio ou texto", async () => {
  const s = await listen(createApp({ analyze: fakeAnalyze(), wordlist }));
  try {
    assert.equal((await fetch(s.url + "/api/assess", { method: "POST", body: form({ taskType: "dance", text: "hi" }) })).status, 400);
    assert.equal((await fetch(s.url + "/api/assess", { method: "POST", body: form({ taskType: "describe" }) })).status, 400);
  } finally { await s.close(); }
});
