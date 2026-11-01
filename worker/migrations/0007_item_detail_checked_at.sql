ALTER TABLE items ADD COLUMN detail_checked_at TEXT;

-- engagement is only ever written by the detail scrape, so these rows have been checked before.
UPDATE items SET detail_checked_at = updated_at WHERE engagement IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_items_detail_checked_at ON items(detail_checked_at);

-- The detail worker no longer keeps a cursor.
DELETE FROM ingest_state WHERE key LIKE 'detail_cursor%';
