import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server/app.js";
import { openStore } from "../server/db.js";
import { loadWordlist } from "../server/wordlist.js";
import { EXAMPLES, synthTimings } from "../fixtures/examples.js";
import { PLACEMENT_TEST } from "../src/questions.js";
import { listen, makeWebm, form } from "./helpers.js";

const wordlist = loadWordlist();

/**
 * Azure falso: devolve, para cada áudio, a resposta de um exemplo do documento (com tempos sintéticos),
 * no formato que normalize-azure entende. O analisador falso devolve a análise do mesmo exemplo.
 */
function fakes(sequence) {
  let i = 0, j = 0;
  const speech = {
    assess: async () => {
      const ex = sequence[i++ % sequence.length];
      const words = synthTimings(ex.transcript, ex.audio);
      return [{
        RecognitionStatus: "Success", DisplayText: ex.transcript,
        NBest: [{
          Confidence: 0.9, Display: ex.transcript,
          PronunciationAssessment: { AccuracyScore: ex.pronunciation.accuracy, ProsodyScore: ex.pronunciation.prosody },
          Words: words.map((w) => ({ Word: w.word.replace(/[^\w'é]/g, "").toLowerCase(), Offset: Math.round(w.start * 1e7), Duration: Math.round((w.end - w.start) * 1e7), PronunciationAssessment: { AccuracyScore: ex.pronunciation.accuracy, ErrorType: "None" } })),
        }],
      }];
    },
  };
  const analyze = async () => sequence[j++ % sequence.length].analysis;
  return { speech, analyze };
}

async function setup(sequence) {
  const audioDir = fs.mkdtempSync(path.join(os.tmpdir(), "vozclara-audio-"));
  const store = openStore(":memory:");
  const s = await listen(createApp({ ...fakes(sequence), wordlist, store, audioDir }));
  const post = (url, body) => fetch(s.url + url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json());
  const answer = (sessionId, extra = {}) => fetch(s.url + "/api/assess", { method: "POST", body: form({ sessionId, taskType: "describe", question: "ignored", ...extra }, makeWebm(1)) }).then(async (r) => ({ status: r.status, body: await r.json() }));
  return { s, store, audioDir, post, answer, close: () => { s.close(); store.close(); fs.rmSync(audioDir, { recursive: true, force: true }); } };
}

// respostas longas o bastante (>= 40 palavras) e do mesmo nível, para a sessão ser oficial
const [, , B1, B2, C1] = EXAMPLES;
const long = (ex) => ({ ...ex, transcript: ex.transcript + " " + ex.transcript });

test("teste de nível: 3 perguntas na ordem describe, narrate, argument; salva respostas, áudio e JSON completo", async () => {
  const t = await setup([long(B1)]);
  try {
    const start = await t.post("/api/sessions", { kind: "test" });
    assert.equal(start.step.position, 0);
    assert.equal(start.step.taskType, "describe");
    const order = [];
    let last;
    for (let k = 0; k < 3; k++) {
      last = await t.answer(start.session.id, { taskType: "argument" }); // o servidor ignora o tipo do cliente no teste
      assert.equal(last.status, 200, JSON.stringify(last.body));
      order.push(last.body.taskType);
      assert.equal(last.body.question, PLACEMENT_TEST[k].q);
    }
    assert.deepEqual(order, ["describe", "narrate", "argument"]);
    assert.equal(last.body.test.done, true);
    const o = last.body.test.outcome;
    assert.equal(o.official, true, JSON.stringify(o.reasons));
    assert.equal(o.profileBefore, null);
    assert.equal(o.profileAfter, null, "o nível do perfil só é definido depois de 3 sessões oficiais");
    assert.equal(o.sessionsToDefine, 2);

    const rows = t.store.listResponses(start.session.id);
    assert.equal(rows.length, 3);
    assert.ok(rows[0].assessment.dimensions && rows[0].assessment.details.vocabulary.profile, "JSON completo de assessResponse");
    assert.ok(fs.existsSync(path.join(t.audioDir, rows[0].audioPath)), "áudio salvo em disco");

    const again = await t.answer(start.session.id);
    assert.equal(again.status, 409);
  } finally { t.close(); }
});

test("depois de 3 testes oficiais o perfil ganha nível; conversa livre nunca muda o perfil", async () => {
  const t = await setup([long(B1)]);
  try {
    for (let n = 0; n < 3; n++) {
      const { session } = await t.post("/api/sessions", { kind: "test" });
      let r;
      for (let k = 0; k < 3; k++) r = await t.answer(session.id);
      if (n === 2) {
        assert.equal(r.body.test.outcome.changed, true);
        assert.equal(r.body.test.outcome.profileAfter, r.body.test.outcome.level);
      }
    }
    const profile = await fetch(t.s.url + "/api/profile").then((x) => x.json());
    assert.ok(profile.level);
    assert.equal(profile.history.length, 3);

    const free = await t.post("/api/sessions", { kind: "free" });
    const sameDay = await t.post("/api/sessions", { kind: "free" });
    assert.equal(free.session.id, sameDay.session.id, "uma conversa livre por dia");
    for (let k = 0; k < 4; k++) {
      const r = await t.answer(free.session.id, { taskType: "opinion", question: "Q?" });
      assert.equal(r.body.test, undefined);
      assert.ok(r.body.result.indicativeLevel);
    }
    const after = await fetch(t.s.url + "/api/profile").then((x) => x.json());
    assert.deepEqual(after, profile);

    const prog = await fetch(t.s.url + "/api/progress").then((x) => x.json());
    assert.equal(prog.sessions.length, 4);
    assert.equal(prog.officialHistory.length, 3);
    assert.equal(prog.sessions[3].kind, "free");
    assert.ok(prog.sessions[3].dimensions.grammar > 0);
  } finally { t.close(); }
});

test("resposta curta no teste ganha uma nova tentativa na mesma pergunta", async () => {
  const short = EXAMPLES[0]; // A1, 18 palavras
  const t = await setup([short, long(B1), long(B2), long(C1)]);
  try {
    const { session } = await t.post("/api/sessions", { kind: "test" });
    const r1 = await t.answer(session.id);
    assert.ok(r1.body.result.flags.includes("amostra_curta"));
    assert.equal(r1.body.test.step.position, 0, "repete a pergunta 1");
    assert.equal(r1.body.test.step.attempt, 2);
    const r2 = await t.answer(session.id);
    assert.equal(r2.body.test.step.position, 1);
    await t.answer(session.id);
    const r4 = await t.answer(session.id);
    assert.equal(r4.body.test.done, true);
    assert.equal(r4.body.test.outcome.official, true, JSON.stringify(r4.body.test.outcome.reasons));
  } finally { t.close(); }
});

test("apagar histórico remove sessões, áudios e nível", async () => {
  const t = await setup([long(B1)]);
  try {
    const { session } = await t.post("/api/sessions", { kind: "free" });
    await t.answer(session.id, { taskType: "opinion" });
    const audio = t.store.listResponses(session.id)[0].audioPath;
    const r = await fetch(t.s.url + "/api/history", { method: "DELETE" }).then((x) => x.json());
    assert.equal(r.ok, true);
    const prog = await fetch(t.s.url + "/api/progress").then((x) => x.json());
    assert.equal(prog.sessions.length, 0);
    await new Promise((res) => setTimeout(res, 50));
    assert.equal(fs.existsSync(path.join(t.audioDir, audio)), false);
  } finally { t.close(); }
});
