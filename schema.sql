-- Vouch Explorer schema (portable: SQLite now, Postgres/libSQL later).
-- JSON stored as TEXT, timestamps as ISO-8601 TEXT. No views: trust_edges is a repo query.

CREATE TABLE projects (
  id INTEGER PRIMARY KEY,
  full_name TEXT NOT NULL UNIQUE,        -- owner/repo
  owner TEXT NOT NULL,
  repo TEXT NOT NULL,
  description TEXT,
  language TEXT,
  topics TEXT NOT NULL DEFAULT '[]',     -- JSON array
  stars INTEGER NOT NULL DEFAULT 0,
  html_url TEXT,
  contributing_url TEXT,
  vouch_file_path TEXT,
  vouch_file_sha TEXT,
  indexed_at TEXT,
  is_seed INTEGER NOT NULL DEFAULT 0,
  created_by TEXT                         -- future multi-user ownership
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  platform TEXT NOT NULL DEFAULT 'github',
  login TEXT NOT NULL,
  avatar_url TEXT,
  UNIQUE (platform, login)
);

CREATE TABLE vouch_entries (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL,                   -- 'vouched' | 'denounced'
  note TEXT,
  line_no INTEGER,
  first_seen_at TEXT NOT NULL,
  removed_at TEXT,
  UNIQUE (project_id, user_id)
);

CREATE TABLE vouch_events (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,                   -- 'vouch' | 'denounce' | 'remove'
  voucher_id INTEGER REFERENCES users(id),-- NULL = unknown, never guessed
  commit_sha TEXT,
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'crawl',   -- 'crawl' | 'git' | 'seed'
  UNIQUE (project_id, user_id, action, commit_sha)
);

CREATE TABLE issues (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  number INTEGER NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  labels TEXT NOT NULL DEFAULT '[]',      -- JSON array
  fetched_at TEXT NOT NULL,
  UNIQUE (project_id, number)
);

CREATE TABLE vouch_requests (
  id INTEGER PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id),
  requester_login TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',    -- 'open' | 'vouched' | 'more_info' | 'denounced'
  reply_text TEXT,
  created_at TEXT NOT NULL,
  decided_by TEXT,
  decided_at TEXT,
  is_seed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE ai_briefs (
  id INTEGER PRIMARY KEY,
  subject_type TEXT NOT NULL,             -- 'user' | 'request' | 'discover'
  subject_key TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  input_json TEXT NOT NULL,
  output_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (subject_type, subject_key, model, prompt_version)
);

CREATE TABLE github_cache (
  cache_key TEXT PRIMARY KEY,
  json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
