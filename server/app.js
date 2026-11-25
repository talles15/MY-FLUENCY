import fs from "node:fs";
import path from "node:path";
import express from "express";
import multer from "multer";
import { transcribe, scoreAnswer } from "./pipeline.js";
import { testStep, finishTest, progress } from "./sessions.js";
import { TASK_TYPES } from "../src/questions.js";

const AUDIO_EXT = { "audio/webm": "webm", "video/webm": "webm", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/ogg": "ogg", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mpeg": "mp3" };

const httpError = (status, message) => Object.assign(new Error(message), { status });

/**
 * Cria o app Express. As dependências externas (Azure, Anthropic, banco) entram por parâmetro
 * para que os testes possam trocar por versões falsas, sem rede.
 * @param {object} deps
 * @param {{assess:Function}|null} [deps.speech]   cliente de pronúncia (server/azure-speech.js)
 * @param {Function|null} [deps.analyze]           analisador LLM (server/analyze.js)
 * @param {Map<string,string>} [deps.wordlist]      lista CEFR carregada na subida
 * @param {object|null} [deps.store]               repositório SQLite (server/db.js)
 * @param {string} [deps.audioDir]                 onde salvar os áudios das respostas
 */
export function createApp(deps = {}) {
  const { speech = null, analyze = null, wordlist = new Map(), store = null, audioDir = null } = deps;
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

  const needStore = () => { if (!store) throw httpError(503, "Banco de dados indisponível."); return store; };

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, services: { speech: !!speech, llm: !!analyze, db: !!store } });
  });

  /* ---------------- perfil e sessões ---------------- */

  app.get("/api/profile", (_req, res) => {
    const u = needStore().getUser();
    res.json({ level: u.level, history: u.history });
  });

  /**
   * Abre uma sessão.
   * - kind "test": teste de nível novo (fecha testes abertos antes) e devolve a 1ª pergunta;
   * - kind "free": devolve a conversa livre aberta de hoje ou cria uma.
   */
  app.post("/api/sessions", (req, res) => {
    const s = needStore();
    const kind = req.body && req.body.kind;
    if (kind !== "test" && kind !== "free") throw httpError(400, 'kind deve ser "test" ou "free".');
    const user = s.getUser();
    if (kind === "free") {
      let session = s.openFreeSessionToday(user.id);
      if (!session) { s.closeOpenSessions(user.id, "free"); session = s.createSession(user.id, "free"); }
      return res.json({ session });
    }
    s.closeOpenSessions(user.id, "test");
    const session = s.createSession(user.id, "test");
    res.json({ session, step: testStep([]) });
  });

  app.get("/api/sessions/:id", (req, res) => {
    const s = needStore();
    const session = s.getSession(Number(req.params.id));
    if (!session) throw httpError(404, "Sessão não encontrada.");
    const responses = s.listResponses(session.id);
    res.json({ session, responses, step: session.kind === "test" && session.status === "open" ? testStep(responses) : null });
  });

  app.get("/api/progress", (_req, res) => {
    const s = needStore();
    res.json(progress(s, s.getUser()));
  });

  /** Apaga sessões, respostas, áudios e o nível do perfil. */
  app.delete("/api/history", (_req, res) => {
    const s = needStore();
    const user = s.getUser();
    const files = s.allAudioPaths(user.id);
    s.resetHistory(user.id);
    if (audioDir) for (const f of files) fs.rm(path.join(audioDir, f), { force: true }, () => {});
    res.json({ ok: true });
  });

  /* ---------------- avaliação ---------------- */

  /**
   * Avalia uma resposta falada (campo "audio") ou digitada (campo "text").
   * Com sessionId, salva a resposta; no teste de nível, a pergunta e o tipo de tarefa vêm do servidor.
   */
  app.post("/api/assess", upload.single("audio"), async (req, res) => {
    const body = req.body || {};
    let { question = "", taskType = "" } = body;
    const { text = "", fallbackTranscript = "" } = body;
    const sessionId = body.sessionId ? Number(body.sessionId) : null;

    let session = null, step = null, position = 0;
    if (sessionId) {
      session = needStore().getSession(sessionId);
      if (!session) throw httpError(404, "Sessão não encontrada.");
      if (session.status !== "open") throw httpError(409, "Esta sessão já terminou. Comece outra.");
      if (session.kind === "test") {
        step = testStep(store.listResponses(session.id));
        if (step.done) throw httpError(409, "O teste já tem as três respostas.");
        ({ question, taskType, position } = step);
      } else {
        position = store.countResponses(session.id);
      }
    }

    if (!TASK_TYPES.includes(taskType)) throw httpError(400, `taskType inválido. Use: ${TASK_TYPES.join(", ")}.`);
    if (!req.file && !String(text).trim()) throw httpError(400, "Envie o áudio da resposta ou o texto digitado.");
    if (!analyze) throw httpError(503, "A análise por IA não está configurada no servidor (ANTHROPIC_API_KEY).");

    const t = await transcribe({ audio: req.file && req.file.buffer, text, fallbackTranscript, speech });
    if (!t.transcript) {
      throw httpError(502, "Não consegui transcrever o áudio. " + (t.speechError || "Não ouvi fala em inglês. Tente falar mais perto do microfone."));
    }
    const { analysis, result } = await scoreAnswer({ question, taskType, t, analyze, wordlist });

    const out = {
      question, taskType,
      transcript: t.transcript, wordScores: t.wordScores, pronunciation: t.pronunciation,
      transcriptSource: t.source, speechError: t.speechError,
      analysis, result,
    };

    if (session) {
      const responseId = store.addResponse({
        sessionId: session.id, position, question, taskType, transcript: t.transcript,
        assessment: result, analysis,
        extra: { wordScores: t.wordScores, pronunciation: t.pronunciation, transcriptSource: t.source, speechError: t.speechError },
      });
      if (req.file && audioDir) {
        const ext = AUDIO_EXT[String(req.file.mimetype).split(";")[0]] || "webm";
        const rel = `${session.id}/${responseId}.${ext}`;
        fs.mkdirSync(path.join(audioDir, String(session.id)), { recursive: true });
        fs.writeFileSync(path.join(audioDir, rel), req.file.buffer);
        store.setAudioPath(responseId, rel);
      }
      out.responseId = responseId;
      out.sessionId = session.id;

      if (session.kind === "test") {
        const next = testStep(store.listResponses(session.id));
        if (next.done) {
          const fin = finishTest(store, session, store.getUser());
          out.test = { done: true, outcome: fin.outcome };
        } else {
          out.test = { done: false, step: next };
        }
      }
    }
    res.json(out);
  });

  /** Aba Pronúncia: leitura de uma frase conhecida (Azure com roteiro). Não altera o nível. */
  app.post("/api/read", upload.single("audio"), async (req, res) => {
    const referenceText = String((req.body && req.body.referenceText) || "").trim();
    if (!req.file || !referenceText) throw httpError(400, "Envie o áudio e a frase lida.");
    if (!speech) throw httpError(503, "O serviço de pronúncia não está configurado no servidor.");
    const t = await transcribe({ audio: req.file.buffer, speech, referenceText });
    if (t.speechError) throw httpError(502, "O serviço de pronúncia falhou: " + t.speechError);
    if (!t.wordScores.length) throw httpError(422, "Não ouvi a frase. Tente de novo, mais perto do microfone.");
    res.json({ referenceText, transcript: t.transcript, wordScores: t.wordScores, pronunciation: t.pronunciation });
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
