// Modo Supabase/Vercel com clientes falsos (sem rede): login, Storage e modelo por tipo de sessão.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app.js";
import { createSupabaseAuth, parseEmails } from "../server/auth.js";
import { createModelRouter } from "../server/analyze.js";
import { openSqliteStore } from "../server/store-sqlite.js";
import { toWav16kMono, wavSeconds } from "../server/audio.js";
import { loadWordlist } from "../server/wordlist.js";
import { encodeWav, isWav16kMono } from "../src/wav.js";
import { EXAMPLES } from "../fixtures/examples.js";
import { listen } from "./helpers.js";

const wordlist = loadWordlist();
const OWNER = { id: "11111111-1111-1111-1111-111111111111", email: "dono@exemplo.com" };
const OTHER = { id: "22222222-2222-2222-2222-222222222222", email: "outro@exemplo.com" };

/** Cliente Supabase falso: só o auth.getUser(token). */
const fakeSb = { auth: { getUser: async (token) => {
  const u = { "tok-owner": OWNER, "tok-other": OTHER }[token];
  return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { message: "invalid JWT" } };
} } };

/** Storage falso em memória, com URL assinada. */
function memAudioStore() {
  const files = new Map();
  return {
    files,
    async put(p, b) { files.set(p, Buffer.from(b)); },
    async get(p) { if (!files.has(p)) throw Object.assign(new Error("não existe"), { status: 404 }); return files.get(p); },
    async remove(ps) { ps.forEach((p) => files.delete(p)); },
    async signedUpload(p) { return { path: p, token: "signed-" + p }; },
  };
}

const wav = (sec = 1) => Buffer.from(encodeWav(new Float32Array(16000 * sec).map((_, i) => Math.sin(i / 10) * 0.3)));
const speech = { assess: async () => [{ RecognitionStatus: "Success", DisplayText: "I live in a small town.", NBest: [{ Display: "I live in a small town.", PronunciationAssessment: { AccuracyScore: 80 },
  Words: ["i", "live", "in", "a", "small", "town"].map((w, k) => ({ Word: w, Offset: k * 4e6, Duration: 3e6, PronunciationAssessment: { AccuracyScore: 80, ErrorType: "None" } })) }] }] };

async function setup() {
  const store = await openSqliteStore(":memory:");
  const audioStore = memAudioStore();
  const calls = [];
  const analyze = async (a) => { calls.push(a); return EXAMPLES[2].analysis; };
  const auth = createSupabaseAuth({ client: fakeSb, allowedEmails: parseEmails("Dono@Exemplo.com") });
  const s = await listen(createApp({ speech, analyze, wordlist, store, audioStore, auth, publicConfig: { supabaseUrl: "https://x.supabase.co", supabasePublishableKey: "pk" } }));
  const req = (method, url, body, token = "tok-owner") => fetch(s.url + url, {
    method, headers: { ...(token ? { authorization: "Bearer " + token } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
  return { s, store, audioStore, calls, req, close: async () => { await s.close(); await store.close(); } };
}

test("/api/config é público e diz ao navegador que há login e envio pelo Storage", async () => {
  const t = await setup();
  try {
    const r = await t.req("GET", "/api/config", null, null);
    assert.deepEqual(r.body, { authRequired: true, supabaseUrl: "https://x.supabase.co", supabasePublishableKey: "pk", upload: "storage", bucket: "audio" });
  } finally { await t.close(); }
});

test("login: sem token 401, token inválido 401, e-mail fora de ALLOWED_EMAILS 403", async () => {
  const t = await setup();
  try {
    assert.equal((await t.req("GET", "/api/profile", null, null)).status, 401);
    assert.equal((await t.req("GET", "/api/profile", null, "tok-falso")).status, 401);
    const other = await t.req("GET", "/api/profile", null, "tok-other");
    assert.equal(other.status, 403);
    assert.match(other.body.error, /não tem acesso/);
    const ok = await t.req("GET", "/api/me");
    assert.deepEqual(ok.body, { email: "dono@exemplo.com" });
  } finally { await t.close(); }
});

test("áudio pelo Storage: URL assinada na pasta do usuário, avaliação lê o arquivo e guarda o caminho", async () => {
  const t = await setup();
  try {
    const up = await t.req("POST", "/api/upload-url", {});
    assert.ok(up.body.path.startsWith(OWNER.id + "/"), up.body.path);
    await t.audioStore.put(up.body.path, wav(2)); // o navegador enviaria com uploadToSignedUrl
    const { body: { session } } = await t.req("POST", "/api/sessions", { kind: "free" });
    const r = await t.req("POST", "/api/assess", { sessionId: session.id, taskType: "describe", question: "Q?", audioPath: up.body.path });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.transcript, "I live in a small town.");
    const saved = await t.store.listResponses(OWNER.id, session.id);
    assert.equal(saved[0].audioPath, up.body.path);
    assert.equal(t.calls[0].purpose, "free");
  } finally { await t.close(); }
});

test("não dá para usar o áudio nem a sessão de outro usuário", async () => {
  const t = await setup();
  try {
    const foreign = `${OTHER.id}/x.wav`;
    await t.audioStore.put(foreign, wav(1));
    const r = await t.req("POST", "/api/assess", { taskType: "describe", audioPath: foreign });
    assert.equal(r.status, 403);
    const sneaky = await t.req("POST", "/api/assess", { taskType: "describe", audioPath: `${OWNER.id}/../${OTHER.id}/x.wav` });
    assert.equal(sneaky.status, 403);
    const otherSession = await t.store.createSession(OTHER.id, "free");
    const r2 = await t.req("POST", "/api/assess", { sessionId: otherSession.id, taskType: "describe", text: "hello there" });
    assert.equal(r2.status, 404);
  } finally { await t.close(); }
});

test("o WAV 16 kHz mono do navegador passa direto, sem ffmpeg", async () => {
  const w = wav(2);
  assert.ok(isWav16kMono(w));
  const out = await toWav16kMono(w);
  assert.equal(out, w);
  assert.equal(wavSeconds(out), 2);
});

test("modelo por tipo de sessão: Haiku na conversa livre, Sonnet no teste de nível", async () => {
  const models = [];
  const client = { beta: { messages: { create: async (p) => { models.push(p.model); return { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(EXAMPLES[2].analysis) }] }; } } } };
  const route = createModelRouter({ freeModel: "claude-haiku-5-5", testModel: "claude-sonnet-5-5", client });
  await route({ question: "Q", transcript: "T", taskType: "describe", purpose: "free" });
  await route({ question: "Q", transcript: "T", taskType: "argument", purpose: "test" });
  assert.deepEqual(models, ["claude-haiku-5-5", "claude-sonnet-5-5"]);
  assert.equal(route.modelFor("test"), "claude-sonnet-5-5");
});
