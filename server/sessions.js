import { assessSession, updateProfileLevel, RULES } from "../src/cefr-engine.js";
import { PLACEMENT_TEST } from "../src/questions.js";

export const MAX_ATTEMPTS_PER_QUESTION = 2;

/**
 * Em que pergunta do teste o aluno está. Uma resposta que não conta para o nível
 * (menos de 40 palavras ou possível leitura) ganha UMA nova tentativa na mesma pergunta.
 * @returns {{done:false, position, attempt, question, taskType, total, retryReason}|{done:true}}
 */
export function testStep(responses) {
  for (let p = 0; p < PLACEMENT_TEST.length; p++) {
    const tries = responses.filter((r) => r.position === p);
    const last = tries.at(-1);
    if (!last) return { done: false, position: p, attempt: 1, ...pick(p), total: PLACEMENT_TEST.length, retryReason: null };
    if (!last.assessment.countsForLevel && tries.length < MAX_ATTEMPTS_PER_QUESTION) {
      return { done: false, position: p, attempt: tries.length + 1, ...pick(p), total: PLACEMENT_TEST.length, retryReason: last.assessment.flags };
    }
  }
  return { done: true, total: PLACEMENT_TEST.length };
}
const pick = (p) => ({ question: PLACEMENT_TEST[p].q, taskType: PLACEMENT_TEST[p].taskType });

/** Última tentativa de cada pergunta do teste. */
export function finalAttempts(responses) {
  return PLACEMENT_TEST.map((_, p) => responses.filter((r) => r.position === p).at(-1)).filter(Boolean);
}

/**
 * Fecha o teste: assessSession() nas respostas e, se a sessão for oficial, updateProfileLevel().
 * O nível do perfil só muda pelas regras do motor (inclusive a histerese de 3 sessões).
 */
export async function finishTest(store, userId, session) {
  const responses = finalAttempts(await store.listResponses(userId, session.id));
  const result = assessSession(responses.map((r) => r.assessment));
  const before = await store.getProfile(userId);
  let after = before;
  if (result.official && result.level) {
    after = updateProfileLevel(before, result.level);
    await store.saveProfile(userId, after);
  }
  const s = await store.finishSession(userId, session.id, { official: result.official, level: result.level, result, profileBefore: before, profileAfter: after });
  return { session: s, outcome: describeOutcome(result, before, after) };
}

/** Resumo do resultado do teste para a tela. */
export function describeOutcome(result, before, after) {
  const sessionsToDefine = Math.max(0, RULES.hysteresisSessions - (after.history || []).length);
  return {
    official: result.official,
    reasons: result.reasons,
    sessionLevel: result.label || result.level,
    level: result.level,
    capped: result.capped,
    cappedBy: result.cappedBy,
    gatedByTask: result.gatedByTask,
    dimensions: result.dimensions,
    dimensionLevels: result.dimensionLevels,
    profileBefore: before.level,
    profileAfter: after.level,
    changed: before.level !== after.level,
    sessionsToDefine: after.level ? 0 : sessionsToDefine,
  };
}

/**
 * Evolução por sessão: as quatro dimensões (média ponderada por palavras das respostas válidas,
 * a mesma conta de assessSession) e o histórico de níveis oficiais.
 */
export async function progress(store, userId) {
  const sessions = [];
  const officialHistory = [];
  const profile = await store.getProfile(userId);
  const bySession = new Map();
  for (const r of await store.listAllResponses(userId)) {
    if (!bySession.has(r.sessionId)) bySession.set(r.sessionId, []);
    bySession.get(r.sessionId).push(r);
  }
  for (const s of await store.listSessions(userId)) {
    const responses = bySession.get(s.id) || [];
    if (!responses.length) continue;
    const chosen = s.kind === "test" ? finalAttempts(responses) : responses;
    const r = s.result || assessSession(chosen.map((x) => x.assessment));
    sessions.push({
      id: s.id, kind: s.kind, status: s.status, createdAt: s.createdAt,
      responses: responses.length,
      validResponses: chosen.filter((x) => x.assessment.countsForLevel).length,
      dimensions: r.dimensions,
      level: s.kind === "test" ? s.level : null,
      official: s.kind === "test" ? !!s.official : false,
    });
    if (s.kind === "test" && s.official) {
      officialHistory.push({ sessionId: s.id, date: s.finishedAt, sessionLevel: s.level, profileLevel: s.profileAfter && s.profileAfter.level });
    }
  }
  return { profile, sessions, officialHistory };
}

/** Início do dia de hoje (ISO, UTC) no fuso do aluno — a conversa livre agrupa respostas por dia. */
export function startOfTodayIso(timeZone = "America/Sao_Paulo", nowDate = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
    .formatToParts(nowDate).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offsetMs = asUtc - Math.floor(nowDate.getTime() / 1000) * 1000; // fuso - UTC
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offsetMs).toISOString();
}
