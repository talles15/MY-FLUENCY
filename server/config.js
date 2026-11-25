import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEmails } from "./auth.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fromRoot = (p) => (path.isAbsolute(p) ? p : path.join(ROOT, p));
const env = (...names) => names.map((n) => process.env[n]).find((v) => v) || "";

export const config = {
  port: Number(process.env.PORT) || 3001,
  anthropicKey: env("ANTHROPIC_API_KEY"),
  // modelo da conversa livre (barato) e do teste de nível (define o nível oficial)
  modelFree: env("ANTHROPIC_MODEL_FREE", "ANTHROPIC_MODEL") || "claude-haiku-5-5",
  modelTest: env("ANTHROPIC_MODEL_TEST", "ANTHROPIC_MODEL") || "claude-sonnet-5-5",
  azureKey: env("AZURE_SPEECH_KEY"),
  azureRegion: env("AZURE_SPEECH_REGION"),
  // Supabase: aceita os nomes novos (publishable/secret) e os antigos (anon/service_role)
  supabaseUrl: env("SUPABASE_URL"),
  supabasePublishableKey: env("SUPABASE_PUBLISHABLE_KEY", "SUPABASE_ANON_KEY"),
  supabaseSecretKey: env("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY"),
  supabaseBucket: env("SUPABASE_BUCKET") || "audio",
  allowedEmails: parseEmails(process.env.ALLOWED_EMAILS),
  timeZone: env("APP_TIMEZONE") || "America/Sao_Paulo",
  // só no modo local (sem Supabase)
  dbPath: fromRoot(env("DB_PATH") || "data/voz-clara.db"),
  audioDir: fromRoot(env("AUDIO_DIR") || "data/audio"),
};

export const usesSupabase = () => !!(config.supabaseUrl && config.supabaseSecretKey);
