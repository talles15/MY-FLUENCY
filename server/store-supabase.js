/**
 * Repositório no Postgres do Supabase (tabelas em supabase/migrations/0001_init.sql).
 * Usa a chave secreta (service role) só no servidor; todas as consultas filtram por user_id.
 * Mesma interface de store-sqlite.js.
 */
import { rowToSession, rowToResponse } from "./store-sqlite.js";

const asIs = (x) => (x === undefined ? null : x); // jsonb já chega como objeto
const now = () => new Date().toISOString();

function check({ data, error }, what) {
  if (error) throw Object.assign(new Error(`Supabase (${what}): ${error.message}`), { status: 502 });
  return data;
}

export function createSupabaseStore(sb) {
  return {
    kind: "supabase",
    async getProfile(userId) {
      let p = check(await sb.from("profiles").select("*").eq("user_id", userId).maybeSingle(), "perfil");
      if (!p) p = check(await sb.from("profiles").upsert({ user_id: userId }, { onConflict: "user_id" }).select().single(), "criar perfil");
      return { level: p.level, history: p.history || [] };
    },
    async saveProfile(userId, { level, history }) {
      check(await sb.from("profiles").upsert({ user_id: userId, level: level ?? null, history: history || [] }, { onConflict: "user_id" }), "salvar perfil");
    },
    async createSession(userId, kind) {
      const r = check(await sb.from("sessions").insert({ user_id: userId, kind }).select().single(), "criar sessão");
      return rowToSession(r, asIs);
    },
    async getSession(userId, id) {
      return rowToSession(check(await sb.from("sessions").select("*").eq("id", id).eq("user_id", userId).maybeSingle(), "sessão"), asIs);
    },
    async openFreeSessionSince(userId, sinceIso) {
      const rows = check(await sb.from("sessions").select("*").eq("user_id", userId).eq("kind", "free").eq("status", "open")
        .gte("created_at", sinceIso).order("id", { ascending: false }).limit(1), "sessão livre");
      return rowToSession(rows[0], asIs);
    },
    async closeOpenSessions(userId, kind) {
      check(await sb.from("sessions").update({ status: "done", finished_at: now() }).eq("user_id", userId).eq("kind", kind).eq("status", "open"), "fechar sessões");
    },
    async finishSession(userId, id, { official, level, result, profileBefore, profileAfter }) {
      const r = check(await sb.from("sessions").update({
        status: "done", finished_at: now(), official: !!official, level: level ?? null, result,
        profile_before: profileBefore ?? null, profile_after: profileAfter ?? null,
      }).eq("id", id).eq("user_id", userId).select().single(), "fechar teste");
      return rowToSession(r, asIs);
    },
    async listSessions(userId) {
      return check(await sb.from("sessions").select("*").eq("user_id", userId).order("id"), "sessões").map((r) => rowToSession(r, asIs));
    },
    async addResponse(userId, r) {
      const row = check(await sb.from("responses").insert({
        session_id: r.sessionId, user_id: userId, position: r.position, question: r.question, task_type: r.taskType,
        transcript: r.transcript, audio_path: r.audioPath ?? null, assessment: r.assessment, analysis: r.analysis ?? null, extra: r.extra ?? {},
      }).select("id").single(), "salvar resposta");
      return Number(row.id);
    },
    async setAudioPath(userId, responseId, audioPath) {
      check(await sb.from("responses").update({ audio_path: audioPath }).eq("id", responseId).eq("user_id", userId), "caminho do áudio");
    },
    async listResponses(userId, sessionId) {
      return check(await sb.from("responses").select("*").eq("session_id", sessionId).eq("user_id", userId)
        .order("position").order("id"), "respostas").map((r) => rowToResponse(r, asIs));
    },
    async listAllResponses(userId) {
      return check(await sb.from("responses").select("*").eq("user_id", userId)
        .order("session_id").order("position").order("id"), "respostas").map((r) => rowToResponse(r, asIs));
    },
    async allAudioPaths(userId) {
      return check(await sb.from("responses").select("audio_path").eq("user_id", userId).not("audio_path", "is", null), "áudios").map((x) => x.audio_path);
    },
    async resetHistory(userId) {
      check(await sb.from("sessions").delete().eq("user_id", userId), "apagar sessões"); // respostas saem em cascata
      check(await sb.from("profiles").upsert({ user_id: userId, level: null, history: [] }, { onConflict: "user_id" }), "zerar perfil");
    },
    async close() {},
  };
}
