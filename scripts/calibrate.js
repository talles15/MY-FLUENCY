#!/usr/bin/env node
/**
 * Calibração do motor contra níveis dados por professores.
 *
 *   npm run calibrate                 # roda o pipeline completo (Azure + Claude + motor)
 *   npm run calibrate -- --offline    # só usa o cache (não chama Azure nem Claude)
 *   npm run calibrate -- --no-cache   # ignora o cache e chama tudo de novo
 *
 * Lê data/calibracao/*.json, cada um com { audioFile, question, taskType, teacherLevel }
 * (audioFile relativo a data/calibracao/). Imprime concordância, matriz de confusão e as
 * medianas por nível ao lado das âncoras; grava data/calibracao/sugestao-ancoras.json.
 * NUNCA altera ANCHORS em src/cefr-engine.js.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { config, ROOT } from "../server/config.js";
import { createAzureSpeech } from "../server/azure-speech.js";
import { createAnalyzer } from "../server/analyze.js";
import { loadWordlist } from "../server/wordlist.js";
import { transcribe } from "../server/pipeline.js";
import { assessResponse, ANCHORS, LEVELS } from "../src/cefr-engine.js";
import { TASK_TYPES } from "../src/questions.js";
import { agreement, medians, suggestAnchors, formatReport } from "./calibrate-lib.js";

const DIR = path.join(ROOT, "data", "calibracao");
const CACHE = path.join(DIR, ".cache");
const OUT = path.join(DIR, "sugestao-ancoras.json");
const args = new Set(process.argv.slice(2));
const offline = args.has("--offline"), noCache = args.has("--no-cache");

if (!fs.existsSync(DIR)) { console.error(`Pasta ${DIR} não existe. Veja data/calibracao/LEIA-ME.md.`); process.exit(1); }
const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".json") && f !== path.basename(OUT)).sort();
if (!files.length) { console.error("Nenhuma amostra .json em data/calibracao/. Veja data/calibracao/LEIA-ME.md."); process.exit(1); }

const speech = offline ? null : createAzureSpeech({ key: config.azureKey, region: config.azureRegion });
const analyze = offline ? null : createAnalyzer({ apiKey: config.anthropicKey, model: config.anthropicModel });
if (!offline && !analyze) { console.error("ANTHROPIC_API_KEY vazia no .env (ou use --offline para usar só o cache)."); process.exit(1); }
if (!offline && !speech) console.warn("Aviso: sem Azure — pronúncia e fluência ficam de fora e a calibração dessas métricas não vale.");
const wordlist = loadWordlist();
fs.mkdirSync(CACHE, { recursive: true });

const items = [], failures = [];
for (const file of files) {
  try {
    const spec = JSON.parse(fs.readFileSync(path.join(DIR, file), "utf8"));
    const { audioFile, question = "", taskType, teacherLevel } = spec;
    if (!LEVELS.includes(teacherLevel)) throw new Error(`teacherLevel inválido: ${teacherLevel}`);
    if (!TASK_TYPES.includes(taskType)) throw new Error(`taskType inválido: ${taskType}`);
    const audioPath = path.resolve(DIR, audioFile || "");
    if (!audioFile || !fs.existsSync(audioPath)) throw new Error(`áudio não encontrado: ${audioFile}`);
    const audio = fs.readFileSync(audioPath);

    // o cache guarda só o que custa dinheiro (Azure + Claude); o motor roda sempre de novo
    const hash = crypto.createHash("sha256").update(audio).update(question).update(taskType).update(config.anthropicModel).digest("hex").slice(0, 16);
    const cacheFile = path.join(CACHE, `${path.basename(file, ".json")}-${hash}.json`);
    let cached = !noCache && fs.existsSync(cacheFile) ? JSON.parse(fs.readFileSync(cacheFile, "utf8")) : null;
    if (!cached) {
      if (offline) throw new Error("sem cache para esta amostra (rode sem --offline uma vez)");
      process.stderr.write(`… ${file}\n`);
      const t = await transcribe({ audio, speech });
      if (!t.transcript) throw new Error("não consegui transcrever: " + (t.speechError || "sem fala"));
      const analysis = await analyze({ question, transcript: t.transcript, taskType });
      cached = { transcript: t.transcript, words: t.words, pronunciation: t.pronunciation, analysis, speechError: t.speechError };
      fs.writeFileSync(cacheFile, JSON.stringify(cached));
    }
    const result = assessResponse({ ...cached, wordlist, taskType });
    items.push({ file, teacherLevel, result, pronunciation: cached.pronunciation });
  } catch (e) {
    failures.push({ file, error: e.message });
  }
}

const agree = agreement(items);
const med = medians(items);
const sugg = suggestAnchors(med);
fs.writeFileSync(OUT, JSON.stringify({
  geradoEm: new Date().toISOString(),
  amostras: items.length,
  concordancia: { exata: agree.exactPct, maisMenosUm: agree.within1Pct, matriz: agree.matrix },
  ancorasAtuais: ANCHORS,
  ancorasSugeridas: sugg.suggested,
  medianasPorNivel: med,
  diferencasAcimaDe15: sugg.diffs,
  avisos: sugg.warnings,
  porAmostra: items.map((i) => ({ arquivo: i.file, professor: i.teacherLevel, motor: i.result.label, notas: i.result.dimensions, avisos: i.result.flags })),
}, null, 2) + "\n");
console.log(formatReport({ items, agree, med, sugg, failures }));
