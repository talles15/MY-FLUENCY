// Servidor local: npm run dev (com o Vite) ou npm start (serve o build de dist/).
import fs from "node:fs";
import path from "node:path";
import express from "express";
import { config, ROOT } from "./config.js";
import { createApp } from "./app.js";
import { buildDeps } from "./services.js";

const deps = await buildDeps();
const app = createApp(deps);

const dist = path.join(ROOT, "dist");
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.listen(config.port, () => {
  console.log(`Voz Clara (API) em http://localhost:${config.port}`);
  console.log(`  banco: ${deps.mode === "supabase" ? "Supabase (login obrigatório)" : "SQLite local, sem login"}`);
  console.log(`  modelos: conversa livre ${config.modelFree} · teste de nível ${config.modelTest}`);
  if (!deps.analyze) console.warn("Aviso: ANTHROPIC_API_KEY vazia — a análise de gramática e vocabulário não vai funcionar.");
  if (!deps.speech) console.warn("Aviso: AZURE_SPEECH_KEY/REGION vazias — sem pronúncia nem tempos por palavra.");
});
