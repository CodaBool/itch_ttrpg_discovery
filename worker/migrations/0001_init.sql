CREATE TABLE IF NOT EXISTS items (
  url TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  title TEXT,
  description TEXT,
  image_url TEXT,
  price TEXT,
  publish_date TEXT,
  update_date TEXT,
  author TEXT,
  author_url TEXT,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_items_updated_at ON items(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_items_publish_date ON items(publish_date DESC);
