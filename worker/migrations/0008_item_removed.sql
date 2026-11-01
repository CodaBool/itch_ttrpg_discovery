-- The detail scrape hides items that fail a rule instead of deleting them. A deleted row was
-- re-added by the next ingest that saw it; a hidden row is kept, so ingest only merges into it.
-- removed_reason is 'excluded_tag', 'ai_assisted', or 'low_rating'. Both columns are cleared when
-- a later check passes.
ALTER TABLE items ADD COLUMN removed_reason TEXT;
ALTER TABLE items ADD COLUMN removed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_items_removed_at ON items(removed_at);
