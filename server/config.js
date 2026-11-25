import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fromRoot = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));

export const config = {
  port: Number(process.env.PORT) || 3001,
  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  anthropicModel: process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5",
  azureKey: process.env.AZURE_SPEECH_KEY || "",
  azureRegion: process.env.AZURE_SPEECH_REGION || "",
  dbPath: fromRoot(process.env.DB_PATH || "data/voz-clara.db"),
  audioDir: fromRoot(process.env.AUDIO_DIR || "data/audio"),
};
