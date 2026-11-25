import crypto from "node:crypto";
import express from "express";
import multer from "multer";
import { transcribe, scoreAnswer } from "./pipeline.js";
import { testStep, finishTest, progress, startOfTodayIso } from "./sessions.js";
import { localAuth } from "./auth.js";
import { TASK_TYPES } from "../src/questions.js";

const httpError = (status, message) => Object.assign(new Error(message), { status });

/**
 * Cria o app Express. As dependências externas entram por parâmetro para que os testes possam
 * trocar por versões falsas, sem rede.
 * @param {object} deps
 * @param {{assess:Function}|null} [deps.speech]   cliente de pronúncia (server/azure-speech.js)
 * @param {Function|null} [deps.analyze]           analisador LLM: ({question, transcript, taskType, purpose}) => análise
 * @param {Map<string,string>} [deps.wordlist]      lista CEFR carregada na subida
 * @param {object|null} [deps.store]               repositório (store-sqlite.js ou store-supabase.js)
 * @param {object|null} [deps.audioStore]          onde guardar os áudios (audio-store.js)
 * @param {object} [deps.auth]                     quem está chamando (auth.js)
 * @param {object} [deps.publicConfig]             o que o navegador precisa saber (URL e chave pública do Supabase)
 * @param {string} [deps.timeZone]                 fuso para "hoje" na conversa livre
 */
export function createApp(deps = {}) {
  const {
    speech = null, analyze = null, wordlist = new Map(), store = null, audioStore = null,
    auth = localAuth, publicConfig = {}, timeZone = "America/Sao_Paulo",
  } = deps;
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  // envio direto (modo local). Na Vercel o áudio vai para o Storage e aqui chega só o caminho.
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

  const needStore = () => { if (!store) throw httpError(503, "Banco de dados indisponível."); return store; };
  const uid = (req) => req.user.userId;

  /* ---------------- rotas públicas ---------------- */

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, services: { speech: !!speech, llm: !!analyze, db: !!store } });
  });

  /** Configuração pública para o navegador (a chave publicável do Supabase pode ir para o navegador). */
  app.get("/api/config", (_req, res) => {
    res.json({
      authRequired: !!auth.required,
      supabaseUrl: publicConfig.supabaseUrl || null,
      supabasePublishableKey: publicConfig.supabasePublishableKey || null,
      upload: audioStore && audioStore.signedUpload ? "storage" : "direct",
      bucket: publicConfig.bucket || "audio",
    });
  });

  /* ---------------- daqui para baixo, só com login ---------------- */

  app.use("/api", async (req, _res, next) => {
    try { req.user = await auth.identify(req); next(); } catch (e) { next(e); }
  });

  app.get("/api/me", (req, res) => res.json({ email: req.user.email }));

  app.get("/api/profile", async (req, res) => {
    res.json(await needStore().getProfile(uid(req)));
  });

  /**
   * Abre uma sessão.
   * - kind "test": teste de nível novo (fecha testes abertos antes) e devolve a 1ª pergunta;
   * - kind "free": devolve a conversa livre aberta de hoje ou cria uma.
   */
  app.post("/api/sessions", async (req, res) => {
    const s = needStore();
    const kind = req.body && req.body.kind;
    if (kind !== "test" && kind !== "free") throw httpError(400, 'kind deve ser "test" ou "free".');
    if (kind === "free") {
      let session = await s.openFreeSessionSince(uid(req), startOfTodayIso(timeZone));
      if (!session) { await s.closeOpenSessions(uid(req), "free"); session = await s.createSession(uid(req), "free"); }
      return res.json({ session });
    }
    await s.closeOpenSessions(uid(req), "test");
    const session = await s.createSession(uid(req), "test");
    res.json({ session, step: testStep([]) });
  });

  app.get("/api/sessions/:id", async (req, res) => {
    const s = needStore();
    const session = await s.getSession(uid(req), Number(req.params.id));
    if (!session) throw httpError(404, "Sessão não encontrada.");
    const responses = await s.listResponses(uid(req), session.id);
    res.json({ session, responses, step: session.kind === "test" && session.status === "open" ? testStep(responses) : null });
  });

  app.get("/api/progress", async (req, res) => {
    res.json(await progress(needStore(), uid(req)));
  });

  /** Apaga sessões, respostas, áudios e o nível do perfil. */
  app.delete("/api/history", async (req, res) => {
    const s = needStore();
    const files = await s.allAudioPaths(uid(req));
    await s.resetHistory(uid(req));
    if (audioStore) await audioStore.remove(files).catch((e) => console.error("apagar áudios:", e.message));
    res.json({ ok: true });
  });

  /** URL assinada para o navegador enviar o WAV direto ao Supabase Storage. */
  app.post("/api/upload-url", async (req, res) => {
    if (!audioStore || !audioStore.signedUpload) throw httpError(400, "Este servidor recebe o áudio direto, sem URL de envio.");
    const p = `${uid(req)}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}.wav`;
    res.json(await audioStore.signedUpload(p));
  });

  /** Lê o áudio da requisição: arquivo enviado (modo local) ou caminho no Storage (Vercel). */
  async function audioFrom(req) {
    if (req.file) return { bytes: req.file.buffer, storedPath: null };
    const p = req.body && req.body.audioPath;
    if (!p) return { bytes: null, storedPath: null };
    if (!audioStore) throw httpError(400, "Este servidor não tem onde buscar o áudio.");
    if (!String(p).startsWith(uid(req) + "/") || String(p).includes("..")) throw httpError(403, "Esse áudio não é seu.");
    return { bytes: await audioStore.get(p), storedPath: p };
  }

  /* ---------------- avaliação ---------------- */

  /**
   * Avalia uma resposta falada (arquivo "audio" ou audioPath no Storage) ou digitada (campo "text").
   * Com sessionId, salva a resposta; no teste de nível, a pergunta e o tipo de tarefa vêm do servidor.
   */
  app.post("/api/assess", upload.single("audio"), async (req, res) => {
    const body = req.body || {};
    let { question = "", taskType = "" } = body;
    const { text = "", fallbackTranscript = "" } = body;
    const sessionId = body.sessionId ? Number(body.sessionId) : null;
    const userId = uid(req);

    let session = null, step = null, position = 0;
    if (sessionId) {
      session = await needStore().getSession(userId, sessionId);
      if (!session) throw httpError(404, "Sessão não encontrada.");
      if (session.status !== "open") throw httpError(409, "Esta sessão já terminou. Comece outra.");
      if (session.kind === "test") {
        step = testStep(await store.listResponses(userId, session.id));
        if (step.done) throw httpError(409, "O teste já tem as três respostas.");
        ({ question, taskType, position } = step);
      } else {
        position = (await store.listResponses(userId, session.id)).length;
      }
    }

    if (!TASK_TYPES.includes(taskType)) throw httpError(400, `taskType inválido. Use: ${TASK_TYPES.join(", ")}.`);
    const audio = await audioFrom(req);
    if (!audio.bytes && !String(text).trim()) throw httpError(400, "Envie o áudio da resposta ou o texto digitado.");
    if (!analyze) throw httpError(503, "A análise por IA não está configurada no servidor (ANTHROPIC_API_KEY).");

    const purpose = session && session.kind === "test" ? "test" : "free";
    const t = await transcribe({ audio: audio.bytes, text, fallbackTranscript, speech });
    if (!t.transcript) {
      throw httpError(502, "Não consegui transcrever o áudio. " + (t.speechError || "Não ouvi fala em inglês. Tente falar mais perto do microfone."));
    }
    const { analysis, result } = await scoreAnswer({ question, taskType, t, analyze, wordlist, purpose });
    const model = analyze.modelFor ? analyze.modelFor(purpose) : null;

    const out = {
      question, taskType,
      transcript: t.transcript, wordScores: t.wordScores, pronunciation: t.pronunciation,
      transcriptSource: t.source, speechError: t.speechError,
      analysis, result, model,
    };

    if (session) {
      const responseId = await store.addResponse(userId, {
        sessionId: session.id, position, question, taskType, transcript: t.transcript,
        audioPath: audio.storedPath, assessment: result, analysis,
        extra: { wordScores: t.wordScores, pronunciation: t.pronunciation, transcriptSource: t.source, speechError: t.speechError, model },
      });
      if (!audio.storedPath && t.wav && audioStore) {
        const rel = `${userId}/${session.id}/${responseId}.wav`;
        await audioStore.put(rel, t.wav, "audio/wav");
        await store.setAudioPath(userId, responseId, rel);
      }
      out.responseId = responseId;
      out.sessionId = session.id;

      if (session.kind === "test") {
        const next = testStep(await store.listResponses(userId, session.id));
        if (next.done) out.test = { done: true, outcome: (await finishTest(store, userId, session)).outcome };
        else out.test = { done: false, step: next };
      }
    } else if (audio.storedPath && audioStore) {
      await audioStore.remove([audio.storedPath]).catch(() => {}); // avaliação avulsa: não guarda o áudio
    }
    res.json(out);
  });

  /** Aba Pronúncia: leitura de uma frase conhecida (Azure com roteiro). Não altera o nível nem guarda o áudio. */
  app.post("/api/read", upload.single("audio"), async (req, res) => {
    const referenceText = String((req.body && req.body.referenceText) || "").trim();
    const audio = await audioFrom(req);
    try {
      if (!audio.bytes || !referenceText) throw httpError(400, "Envie o áudio e a frase lida.");
      if (!speech) throw httpError(503, "O serviço de pronúncia não está configurado no servidor.");
      const t = await transcribe({ audio: audio.bytes, speech, referenceText });
      if (t.speechError) throw httpError(502, "O serviço de pronúncia falhou: " + t.speechError);
      if (!t.wordScores.length) throw httpError(422, "Não ouvi a frase. Tente de novo, mais perto do microfone.");
      res.json({ referenceText, transcript: t.transcript, wordScores: t.wordScores, pronunciation: t.pronunciation });
    } finally {
      if (audio.storedPath && audioStore) audioStore.remove([audio.storedPath]).catch(() => {});
    }
  });

  app.use("/api", (_req, res) => res.status(404).json({ error: "Rota não encontrada." }));

  // erros: sempre JSON legível em português
  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Áudio grande demais (máx. 15 MB)." : err.message });
    const status = err.status || err.statusCode || 500;
    if (status >= 500 && status !== 502 && status !== 503) console.error(err);
    res.status(status).json({ error: status === 500 ? "Erro interno no servidor: " + err.message : err.message });
  });
  return app;
}
