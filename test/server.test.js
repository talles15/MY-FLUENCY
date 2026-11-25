import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createApp } from "../server/app.js";
import { toWav16kMono, wavSeconds } from "../server/audio.js";
import { listen, makeWebm, form } from "./helpers.js";

const azureFixture = JSON.parse(fs.readFileSync(new URL("../fixtures/azure-unscripted.json", import.meta.url)));

test("GET /api/health informa quais serviços estão configurados", async () => {
  const s = await listen(createApp({ speech: { assess: async () => [] } }));
  try {
    const r = await fetch(s.url + "/api/health").then((x) => x.json());
    assert.deepEqual(r.services, { speech: true, llm: false });
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

test("POST /api/assess com áudio: converte, chama o Azure e devolve palavras e pronúncia", async () => {
  let got = null;
  const speech = { assess: async (wav, opts) => { got = { wav, opts }; return azureFixture; } };
  const s = await listen(createApp({ speech }));
  try {
    const r = await fetch(s.url + "/api/assess", { method: "POST", body: form({ question: "Q?", taskType: "narrate" }, makeWebm(1)) }).then((x) => x.json());
    assert.equal(got.wav.readUInt32LE(24), 16000);
    assert.equal(got.opts.referenceText, undefined, "modo sem roteiro");
    assert.equal(r.words.length, 48);
    assert.equal(r.pronunciation.accuracy, 75);
    assert.equal(r.transcriptSource, "azure");
  } finally { await s.close(); }
});

test("POST /api/assess: se o Azure falhar, segue sem pronúncia usando a transcrição de reserva", async () => {
  const speech = { assess: async () => { throw new Error("401 Unauthorized"); } };
  const s = await listen(createApp({ speech }));
  try {
    const ok = await fetch(s.url + "/api/assess", { method: "POST", body: form({ taskType: "describe", fallbackTranscript: "I live in a small town." }, makeWebm(1)) });
    const r = await ok.json();
    assert.equal(ok.status, 200);
    assert.equal(r.pronunciation, null);
    assert.equal(r.transcript, "I live in a small town.");
    assert.match(r.speechError, /401/);

    const fail = await fetch(s.url + "/api/assess", { method: "POST", body: form({ taskType: "describe" }, makeWebm(1)) });
    assert.equal(fail.status, 502);
    assert.match((await fail.json()).error, /transcrever/);
  } finally { await s.close(); }
});

test("POST /api/assess valida taskType e exige áudio ou texto", async () => {
  const s = await listen(createApp({}));
  try {
    assert.equal((await fetch(s.url + "/api/assess", { method: "POST", body: form({ taskType: "dance", text: "hi" }) })).status, 400);
    assert.equal((await fetch(s.url + "/api/assess", { method: "POST", body: form({ taskType: "describe" }) })).status, 400);
  } finally { await s.close(); }
});
