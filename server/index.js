import fs from "node:fs";
import path from "node:path";
import express from "express";
import { config, ROOT } from "./config.js";
import { createApp } from "./app.js";
import { createAzureSpeech } from "./azure-speech.js";

const speech = createAzureSpeech({ key: config.azureKey, region: config.azureRegion });
const app = createApp({ speech });

// Em produção (npm run build && npm start) o próprio Express serve o front-end.
const dist = path.join(ROOT, "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(config.port, () => {
  console.log(`Voz Clara (API) em http://localhost:${config.port}`);
  if (!config.anthropicKey) console.warn("Aviso: ANTHROPIC_API_KEY vazia — a análise de gramática e vocabulário não vai funcionar.");
  if (!speech) console.warn("Aviso: AZURE_SPEECH_KEY/REGION vazias — sem pronúncia nem tempos por palavra pelo áudio.");
});
