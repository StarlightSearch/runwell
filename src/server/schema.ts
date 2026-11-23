/** The SQLite schema, applied by `PRAGMA user_version`. Times are epoch ms. Steps live in events.jsonl, not here. */
export const SCHEMA_VERSION = 3;

export const MIGRATIONS: Record<number, string> = {
  1: `
CREATE TABLE skills (
  key TEXT PRIMARY KEY, source TEXT NOT NULL, name TEXT NOT NULL, ref TEXT NOT NULL, description TEXT,
  path TEXT NOT NULL, plugin TEXT, project_path TEXT, warning TEXT, hash TEXT, has_workflow INTEGER DEFAULT 0,
  seen_at INTEGER, removed_at INTEGER
);
CREATE TABLE skill_versions (
  skill_key TEXT NOT NULL, n INTEGER NOT NULL, hash TEXT NOT NULL, first_seen_at INTEGER NOT NULL,
  PRIMARY KEY (skill_key, n)
);
CREATE TABLE runs (
  id TEXT PRIMARY KEY, skill_key TEXT NOT NULL, skill_ref TEXT NOT NULL, n INTEGER NOT NULL, kind TEXT NOT NULL,
  status TEXT NOT NULL, brief TEXT, cwd TEXT, place TEXT, project_path TEXT, model TEXT, allow_all INTEGER DEFAULT 0,
  skill_version INTEGER, pid INTEGER, created_at INTEGER NOT NULL, started_at INTEGER, ended_at INTEGER,
  waiting_ms INTEGER DEFAULT 0, rating INTEGER, note TEXT, source_ref TEXT, error TEXT
);
CREATE INDEX runs_skill_created ON runs (skill_key, created_at);
CREATE INDEX runs_status ON runs (status);
CREATE TABLE outputs (
  run_id TEXT NOT NULL, path TEXT NOT NULL, label TEXT NOT NULL, kind TEXT NOT NULL, bytes INTEGER, mtime INTEGER,
  copied INTEGER DEFAULT 0, hash TEXT, PRIMARY KEY (run_id, path)
);
CREATE TABLE backfill_files (
  path TEXT PRIMARY KEY, size INTEGER, mtime INTEGER, done_at INTEGER, skipped_lines INTEGER DEFAULT 0
);
CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
`,
  // Claude's own session id for a run, so it can be continued with claude --resume.
  2: `ALTER TABLE runs ADD COLUMN session_id TEXT;`,
  // Which marketplace a plugin skill came from, so a whole marketplace can be ignored (@name).
  3: `ALTER TABLE skills ADD COLUMN marketplace TEXT;`,
};
