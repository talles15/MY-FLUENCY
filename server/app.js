import express from "express";
import multer from "multer";
import { transcribe } from "./pipeline.js";
import { TASK_TYPES } from "../src/questions.js";

/**
 * Cria o app Express. As dependências externas (Azure, Anthropic, banco) entram por parâmetro
 * para que os testes possam trocar por versões falsas, sem rede.
 * @param {object} deps
 * @param {{assess:Function}|null} [deps.speech]
 */
export function createApp(deps = {}) {
  const { speech = null } = deps;
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, services: { speech: !!speech, llm: !!deps.analyze } });
  });

  /** Avalia uma resposta falada (campo "audio") ou digitada (campo "text"). */
  app.post("/api/assess", upload.single("audio"), async (req, res) => {
    const { question = "", taskType = "", text = "", fallbackTranscript = "" } = req.body || {};
    if (!TASK_TYPES.includes(taskType)) return res.status(400).json({ error: `taskType inválido. Use: ${TASK_TYPES.join(", ")}.` });
    if (!req.file && !String(text).trim()) return res.status(400).json({ error: "Envie o áudio da resposta ou o texto digitado." });

    const t = await transcribe({ audio: req.file && req.file.buffer, text, fallbackTranscript, speech });
    if (!t.transcript) {
      return res.status(502).json({ error: "Não consegui transcrever o áudio. " + (t.speechError || "Não ouvi fala em inglês. Tente falar mais perto do microfone.") });
    }
    res.json({
      question, taskType,
      transcript: t.transcript, words: t.words, wordScores: t.wordScores, pronunciation: t.pronunciation,
      transcriptSource: t.source, speechError: t.speechError,
    });
  });

  /** Aba Pronúncia: leitura de uma frase conhecida (Azure com roteiro). */
  app.post("/api/read", upload.single("audio"), async (req, res) => {
    const referenceText = String((req.body && req.body.referenceText) || "").trim();
    if (!req.file || !referenceText) return res.status(400).json({ error: "Envie o áudio e a frase lida." });
    if (!speech) return res.status(503).json({ error: "O serviço de pronúncia não está configurado no servidor." });
    const t = await transcribe({ audio: req.file.buffer, speech, referenceText });
    if (t.speechError) return res.status(502).json({ error: "O serviço de pronúncia falhou: " + t.speechError });
    if (!t.wordScores.length) return res.status(422).json({ error: "Não ouvi a frase. Tente de novo, mais perto do microfone." });
    res.json({ referenceText, transcript: t.transcript, wordScores: t.wordScores, pronunciation: t.pronunciation });
  });

  app.use("/api", (_req, res) => res.status(404).json({ error: "Rota não encontrada." }));

  // erros: sempre JSON legível em português
  app.use((err, _req, res, _next) => {
    if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "Áudio grande demais (máx. 15 MB)." : err.message });
    const status = err.status || 500;
    if (status >= 500) console.error(err);
    res.status(status).json({ error: status >= 500 ? "Erro interno no servidor: " + err.message : err.message });
  });
  return app;
}
