import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  level       TEXT,                       -- nível oficial do perfil (só muda por updateProfileLevel)
  history     TEXT NOT NULL DEFAULT '[]', -- níveis das sessões oficiais, mais recente no fim
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id             INTEGER PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('test', 'free')),
  status         TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at    TEXT,
  official       INTEGER,                 -- 1 se assessSession() considerou a sessão oficial
  level          TEXT,                    -- nível calculado da sessão
  result_json    TEXT,                    -- saída completa de assessSession()
  profile_before TEXT,
  profile_after  TEXT
);
CREATE TABLE IF NOT EXISTS responses (
  id              INTEGER PRIMARY KEY,
  session_id      INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  position        INTEGER NOT NULL,        -- no teste: 0, 1, 2 (pode haver 2 tentativas na mesma posição)
  question        TEXT NOT NULL,
  task_type       TEXT NOT NULL,
  transcript      TEXT NOT NULL,
  audio_path      TEXT,                    -- relativo a AUDIO_DIR
  assessment_json TEXT NOT NULL,           -- JSON completo de assessResponse()
  analysis_json   TEXT,                    -- saída validada do LLM
  extra_json      TEXT,                    -- wordScores, pronúncia normalizada, origem da transcrição
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS responses_session ON responses(session_id, position);
`;

const parse = (s, d = null) => (s == null ? d : JSON.parse(s));

/** Repositório SQLite. `file` pode ser ":memory:" nos testes. */
export function openStore(file) {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  const rowToSession = (r) => r && {
    id: r.id, userId: r.user_id, kind: r.kind, status: r.status, createdAt: r.created_at, finishedAt: r.finished_at,
    official: r.official == null ? null : !!r.official, level: r.level, result: parse(r.result_json),
    profileBefore: parse(r.profile_before), profileAfter: parse(r.profile_after),
  };
  const rowToResponse = (r) => r && {
    id: r.id, sessionId: r.session_id, position: r.position, question: r.question, taskType: r.task_type,
    transcript: r.transcript, audioPath: r.audio_path, assessment: parse(r.assessment_json),
    analysis: parse(r.analysis_json), extra: parse(r.extra_json, {}), createdAt: r.created_at,
  };

  return {
    db,

    /** App local de um aluno só: usa (ou cria) o usuário 1. */
    getUser() {
      let u = db.prepare("SELECT * FROM users ORDER BY id LIMIT 1").get();
      if (!u) {
        db.prepare("INSERT INTO users (name) VALUES ('Aluno')").run();
        u = db.prepare("SELECT * FROM users ORDER BY id LIMIT 1").get();
      }
      return { id: u.id, name: u.name, level: u.level, history: parse(u.history, []) };
    },
    saveProfile(userId, { level, history }) {
      db.prepare("UPDATE users SET level = ?, history = ? WHERE id = ?").run(level ?? null, JSON.stringify(history || []), userId);
    },

    createSession(userId, kind) {
      const { lastInsertRowid } = db.prepare("INSERT INTO sessions (user_id, kind) VALUES (?, ?)").run(userId, kind);
      return this.getSession(Number(lastInsertRowid));
    },
    getSession(id) { return rowToSession(db.prepare("SELECT * FROM sessions WHERE id = ?").get(id)); },
    /** Sessão livre aberta de hoje (a conversa livre agrupa as respostas por dia). */
    openFreeSessionToday(userId) {
      return rowToSession(db.prepare("SELECT * FROM sessions WHERE user_id = ? AND kind = 'free' AND status = 'open' AND date(created_at) = date('now') ORDER BY id DESC LIMIT 1").get(userId));
    },
    closeOpenSessions(userId, kind) {
      db.prepare("UPDATE sessions SET status = 'done', finished_at = datetime('now') WHERE user_id = ? AND kind = ? AND status = 'open'").run(userId, kind);
    },
    finishSession(id, { official, level, result, profileBefore, profileAfter }) {
      db.prepare(`UPDATE sessions SET status = 'done', finished_at = datetime('now'), official = ?, level = ?, result_json = ?,
                  profile_before = ?, profile_after = ? WHERE id = ?`)
        .run(official ? 1 : 0, level ?? null, JSON.stringify(result), JSON.stringify(profileBefore ?? null), JSON.stringify(profileAfter ?? null), id);
      return this.getSession(id);
    },
    listSessions(userId) {
      return db.prepare("SELECT * FROM sessions WHERE user_id = ? ORDER BY id").all(userId).map(rowToSession);
    },

    addResponse(r) {
      const { lastInsertRowid } = db.prepare(`INSERT INTO responses
        (session_id, position, question, task_type, transcript, audio_path, assessment_json, analysis_json, extra_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        r.sessionId, r.position, r.question, r.taskType, r.transcript, r.audioPath ?? null,
        JSON.stringify(r.assessment), JSON.stringify(r.analysis ?? null), JSON.stringify(r.extra ?? {}),
      );
      return Number(lastInsertRowid);
    },
    setAudioPath(responseId, audioPath) { db.prepare("UPDATE responses SET audio_path = ? WHERE id = ?").run(audioPath, responseId); },
    listResponses(sessionId) {
      return db.prepare("SELECT * FROM responses WHERE session_id = ? ORDER BY position, id").all(sessionId).map(rowToResponse);
    },
    countResponses(sessionId) { return db.prepare("SELECT COUNT(*) AS n FROM responses WHERE session_id = ?").get(sessionId).n; },
    allAudioPaths(userId) {
      return db.prepare("SELECT r.audio_path FROM responses r JOIN sessions s ON s.id = r.session_id WHERE s.user_id = ? AND r.audio_path IS NOT NULL").all(userId).map((x) => x.audio_path);
    },
    resetHistory(userId) {
      db.transaction(() => {
        db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
        db.prepare("UPDATE users SET level = NULL, history = '[]' WHERE id = ?").run(userId);
      })();
    },
    close() { db.close(); },
  };
}
