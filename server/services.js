/**
 * Monta as dependências do app a partir do .env.
 * - Com SUPABASE_URL + SUPABASE_SECRET_KEY: Postgres e Storage do Supabase e login obrigatório
 *   (só os e-mails de ALLOWED_EMAILS). É o modo da Vercel.
 * - Sem Supabase: SQLite e pasta local, sem login (só para rodar na sua máquina).
 */
import { createClient } from "@supabase/supabase-js";
import { config, usesSupabase } from "./config.js";
import { createAzureSpeech } from "./azure-speech.js";
import { createModelRouter } from "./analyze.js";
import { loadWordlist } from "./wordlist.js";
import { createSupabaseStore } from "./store-supabase.js";
import { createSupabaseAudioStore, createFsAudioStore } from "./audio-store.js";
import { createSupabaseAuth, localAuth } from "./auth.js";

export async function buildDeps() {
  const speech = createAzureSpeech({ key: config.azureKey, region: config.azureRegion });
  const analyze = createModelRouter({ apiKey: config.anthropicKey, freeModel: config.modelFree, testModel: config.modelTest });
  const wordlist = loadWordlist(); // uma vez, na subida
  const common = { speech, analyze, wordlist, timeZone: config.timeZone };

  if (usesSupabase()) {
    const sb = createClient(config.supabaseUrl, config.supabaseSecretKey, { auth: { persistSession: false, autoRefreshToken: false } });
    return {
      ...common,
      mode: "supabase",
      store: createSupabaseStore(sb),
      audioStore: createSupabaseAudioStore(sb, config.supabaseBucket),
      auth: createSupabaseAuth({ client: sb, allowedEmails: config.allowedEmails }),
      publicConfig: { supabaseUrl: config.supabaseUrl, supabasePublishableKey: config.supabasePublishableKey, bucket: config.supabaseBucket },
    };
  }

  const { openSqliteStore } = await import("./store-sqlite.js");
  return {
    ...common,
    mode: "local",
    store: await openSqliteStore(config.dbPath),
    audioStore: createFsAudioStore(config.audioDir),
    auth: localAuth,
    publicConfig: {},
  };
}
