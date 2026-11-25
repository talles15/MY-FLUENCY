// Login com o Supabase (link mágico por e-mail). Só existe quando o servidor diz que há login.
import { createClient } from "@supabase/supabase-js";

let sb = null;
let cfg = { authRequired: false, upload: "direct" };

export async function initAuth() {
  cfg = await fetch("/api/config").then((r) => r.json());
  if (cfg.authRequired) sb = createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, { auth: { persistSession: true, detectSessionInUrl: true } });
  return cfg;
}

export const config = () => cfg;
export const supabase = () => sb;

export async function currentSession() {
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  return data.session;
}

export async function token() {
  const s = await currentSession();
  return s ? s.access_token : null;
}

/** Envia o link de acesso. shouldCreateUser: false — só entra quem você cadastrou no Supabase. */
export async function sendMagicLink(email) {
  let error = null;
  try {
    ({ error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin } }));
  } catch (e) { error = e; }
  if (!error) return;
  if (/signups not allowed|not found|Signups/i.test(error.message)) throw new Error("Este e-mail não está cadastrado no app.");
  if (/fetch|network/i.test(error.message)) throw new Error("Não consegui falar com o Supabase. Verifique a internet e tente de novo.");
  if (/rate limit|security purposes/i.test(error.message)) throw new Error("Muitos pedidos de link seguidos. Espere um minuto e tente de novo.");
  throw new Error("Não consegui enviar o link: " + error.message);
}

export async function signOut() { if (sb) await sb.auth.signOut(); }

export function onSignedIn(cb) {
  if (!sb) return;
  sb.auth.onAuthStateChange((event, session) => { if (event === "SIGNED_IN" && session) cb(session); });
}
