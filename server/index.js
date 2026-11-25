import fs from "node:fs";
import path from "node:path";
import express from "express";
import { config, ROOT } from "./config.js";
import { createApp } from "./app.js";

const app = createApp({
  speechConfigured: !!(config.azureKey && config.azureRegion),
  llmConfigured: !!config.anthropicKey,
});

// Em produção (npm run build && npm start) o próprio Express serve o front-end.
const dist = path.join(ROOT, "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(config.port, () => {
  console.log(`Voz Clara (API) em http://localhost:${config.port}`);
  if (!config.anthropicKey) console.warn("Aviso: ANTHROPIC_API_KEY vazia — a análise de gramática e vocabulário não vai funcionar.");
  if (!config.azureKey || !config.azureRegion) console.warn("Aviso: AZURE_SPEECH_KEY/REGION vazias — sem transcrição nem pronúncia pelo áudio.");
});
