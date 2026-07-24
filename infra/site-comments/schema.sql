CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  parent_id TEXT,
  nickname TEXT NOT NULL,
  email_hash TEXT,
  website TEXT,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved'
);

CREATE INDEX IF NOT EXISTS idx_comments_path_created
  ON comments(path, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comments_parent
  ON comments(parent_id);
