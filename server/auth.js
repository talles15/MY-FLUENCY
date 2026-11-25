/**
 * Quem está chamando a API.
 * - Supabase: o navegador manda o token de login (Authorization: Bearer ...). O servidor confere o
 *   token no Supabase e só aceita os e-mails de ALLOWED_EMAILS — o app é só do dono.
 * - Local (sem Supabase): um usuário fixo "local", sem login.
 */
const unauthorized = (msg) => Object.assign(new Error(msg), { status: 401 });
const forbidden = (msg) => Object.assign(new Error(msg), { status: 403 });

export const parseEmails = (s) => String(s || "").split(/[,\s;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);

export function createSupabaseAuth({ client, allowedEmails }) {
  const allowed = new Set(allowedEmails.map((e) => e.toLowerCase()));
  if (!allowed.size) throw new Error("ALLOWED_EMAILS vazio: defina o(s) e-mail(s) que podem usar o app.");
  return {
    required: true,
    async identify(req) {
      const m = /^Bearer\s+(.+)$/i.exec(req.headers.authorization || "");
      if (!m) throw unauthorized("Faça login para usar o app.");
      const { data, error } = await client.auth.getUser(m[1]);
      if (error || !data || !data.user) throw unauthorized("Sua sessão expirou. Entre de novo.");
      const email = String(data.user.email || "").toLowerCase();
      if (!allowed.has(email)) throw forbidden("Este e-mail não tem acesso a este app.");
      return { userId: data.user.id, email };
    },
  };
}

export const localAuth = { required: false, async identify() { return { userId: "local", email: null }; } };
