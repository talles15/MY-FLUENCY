import fs from "node:fs";
import path from "node:path";
import express from "express";
import { config, ROOT } from "./config.js";
import { createApp } from "./app.js";
import { createAzureSpeech } from "./azure-speech.js";
import { createAnalyzer } from "./analyze.js";
import { loadWordlist } from "./wordlist.js";

const speech = createAzureSpeech({ key: config.azureKey, region: config.azureRegion });
const analyze = createAnalyzer({ apiKey: config.anthropicKey, model: config.anthropicModel });
const wordlist = loadWordlist(); // uma vez, na subida
const app = createApp({ speech, analyze, wordlist });

// Em produção (npm run build && npm start) o próprio Express serve o front-end.
const dist = path.join(ROOT, "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(config.port, () => {
  console.log(`Voz Clara (API) em http://localhost:${config.port} — modelo ${config.anthropicModel}, ${wordlist.size} palavras na lista CEFR`);
  if (!analyze) console.warn("Aviso: ANTHROPIC_API_KEY vazia — a análise de gramática e vocabulário não vai funcionar.");
  if (!speech) console.warn("Aviso: AZURE_SPEECH_KEY/REGION vazias — sem pronúncia nem tempos por palavra pelo áudio.");
});
