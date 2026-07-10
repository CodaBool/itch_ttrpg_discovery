CREATE TABLE IF NOT EXISTS newsletter_subscriptions (
  email TEXT NOT NULL PRIMARY KEY,
  preference_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (length(trim(email)) > 3),
  CHECK (json_valid(preference_json))
);

CREATE INDEX IF NOT EXISTS idx_newsletter_subscriptions_created_at
  ON newsletter_subscriptions(created_at);
