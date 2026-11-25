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
export function finishTest(store, session, user) {
  const responses = finalAttempts(store.listResponses(session.id));
  const result = assessSession(responses.map((r) => r.assessment));
  const before = { level: user.level, history: user.history };
  let after = before;
  if (result.official && result.level) {
    after = updateProfileLevel(before, result.level);
    store.saveProfile(user.id, after);
  }
  const s = store.finishSession(session.id, { official: result.official, level: result.level, result, profileBefore: before, profileAfter: after });
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
export function progress(store, user) {
  const sessions = [];
  const officialHistory = [];
  for (const s of store.listSessions(user.id)) {
    const responses = store.listResponses(s.id);
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
  return { profile: { level: user.level, history: user.history }, sessions, officialHistory };
}
