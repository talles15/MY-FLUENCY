/**
 * Repositório em SQLite (better-sqlite3) — para rodar localmente sem Supabase e para os testes.
 * Mesma interface assíncrona de store-supabase.js. Todas as consultas são filtradas por userId.
 */
import fs from "node:fs";
import path from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS profiles (
  user_id     TEXT PRIMARY KEY,
  level       TEXT,
  history     TEXT NOT NULL DEFAULT '[]',
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id             INTEGER PRIMARY KEY,
  user_id        TEXT NOT NULL,
  kind           TEXT NOT NULL CHECK (kind IN ('test', 'free')),
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at    TEXT,
  official       INTEGER,
  level          TEXT,
  result         TEXT,
  profile_before TEXT,
  profile_after  TEXT
);
CREATE TABLE IF NOT EXISTS responses (
  id          INTEGER PRIMARY KEY,
  session_id  INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id     TEXT NOT NULL,
  position    INTEGER NOT NULL,
  question    TEXT NOT NULL,
  task_type   TEXT NOT NULL,
  transcript  TEXT NOT NULL,
  audio_path  TEXT,
  assessment  TEXT NOT NULL,
  analysis    TEXT,
  extra       TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS responses_session ON responses(session_id, position);
`;

const parse = (s, d = null) => (s == null ? d : JSON.parse(s));
const now = () => new Date().toISOString();

export const rowToSession = (r, json = parse) => r && {
  id: Number(r.id), kind: r.kind, status: r.status, createdAt: r.created_at, finishedAt: r.finished_at,
  official: r.official == null ? null : !!r.official, level: r.level, result: json(r.result),
  profileBefore: json(r.profile_before), profileAfter: json(r.profile_after),
};
export const rowToResponse = (r, json = parse) => r && {
  id: Number(r.id), sessionId: Number(r.session_id), position: r.position, question: r.question, taskType: r.task_type,
  transcript: r.transcript, audioPath: r.audio_path, assessment: json(r.assessment),
  analysis: json(r.analysis), extra: json(r.extra) || {}, createdAt: r.created_at,
};

export async function openSqliteStore(file) {
  const { default: Database } = await import("better-sqlite3");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  const one = (sql, ...a) => db.prepare(sql).get(...a);
  const all = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);

  return {
    kind: "sqlite",
    async getProfile(userId) {
      let p = one("SELECT * FROM profiles WHERE user_id = ?", userId);
      if (!p) { run("INSERT INTO profiles (user_id) VALUES (?)", userId); p = one("SELECT * FROM profiles WHERE user_id = ?", userId); }
      return { level: p.level, history: parse(p.history, []) };
    },
    async saveProfile(userId, { level, history }) {
      await this.getProfile(userId);
      run("UPDATE profiles SET level = ?, history = ? WHERE user_id = ?", level ?? null, JSON.stringify(history || []), userId);
    },
    async createSession(userId, kind) {
      const { lastInsertRowid } = run("INSERT INTO sessions (user_id, kind) VALUES (?, ?)", userId, kind);
      return this.getSession(userId, Number(lastInsertRowid));
    },
    async getSession(userId, id) {
      return rowToSession(one("SELECT * FROM sessions WHERE id = ? AND user_id = ?", id, userId));
    },
    async openFreeSessionSince(userId, sinceIso) {
      return rowToSession(one("SELECT * FROM sessions WHERE user_id = ? AND kind = 'free' AND status = 'open' AND created_at >= ? ORDER BY id DESC LIMIT 1", userId, sinceIso));
    },
    async closeOpenSessions(userId, kind) {
      run("UPDATE sessions SET status = 'done', finished_at = ? WHERE user_id = ? AND kind = ? AND status = 'open'", now(), userId, kind);
    },
    async finishSession(userId, id, { official, level, result, profileBefore, profileAfter }) {
      run(`UPDATE sessions SET status = 'done', finished_at = ?, official = ?, level = ?, result = ?, profile_before = ?, profile_after = ?
           WHERE id = ? AND user_id = ?`,
        now(), official ? 1 : 0, level ?? null, JSON.stringify(result), JSON.stringify(profileBefore ?? null), JSON.stringify(profileAfter ?? null), id, userId);
      return this.getSession(userId, id);
    },
    async listSessions(userId) {
      return all("SELECT * FROM sessions WHERE user_id = ? ORDER BY id", userId).map((r) => rowToSession(r));
    },
    async addResponse(userId, r) {
      const { lastInsertRowid } = run(`INSERT INTO responses
        (session_id, user_id, position, question, task_type, transcript, audio_path, assessment, analysis, extra)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        r.sessionId, userId, r.position, r.question, r.taskType, r.transcript, r.audioPath ?? null,
        JSON.stringify(r.assessment), JSON.stringify(r.analysis ?? null), JSON.stringify(r.extra ?? {}));
      return Number(lastInsertRowid);
    },
    async setAudioPath(userId, responseId, audioPath) {
      run("UPDATE responses SET audio_path = ? WHERE id = ? AND user_id = ?", audioPath, responseId, userId);
    },
    async listResponses(userId, sessionId) {
      return all("SELECT * FROM responses WHERE session_id = ? AND user_id = ? ORDER BY position, id", sessionId, userId).map((r) => rowToResponse(r));
    },
    /** Todas as respostas do usuário (para o progresso), agrupadas depois por sessão. */
    async listAllResponses(userId) {
      return all("SELECT * FROM responses WHERE user_id = ? ORDER BY session_id, position, id", userId).map((r) => rowToResponse(r));
    },
    async allAudioPaths(userId) {
      return all("SELECT audio_path FROM responses WHERE user_id = ? AND audio_path IS NOT NULL", userId).map((x) => x.audio_path);
    },
    async resetHistory(userId) {
      db.transaction(() => {
        run("DELETE FROM responses WHERE user_id = ?", userId);
        run("DELETE FROM sessions WHERE user_id = ?", userId);
        run("UPDATE profiles SET level = NULL, history = '[]' WHERE user_id = ?", userId);
      })();
    },
    async close() { db.close(); },
  };
}
