CREATE TABLE IF NOT EXISTS ingest_bans (
  kind TEXT NOT NULL CHECK (kind IN ('url', 'author')),
  value TEXT NOT NULL,
  reason TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (kind, value)
);

CREATE INDEX IF NOT EXISTS idx_ingest_bans_kind_value ON ingest_bans(kind, value);
