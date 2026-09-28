-- Browser push (lib/web-push.ts): one row per browser that turned notifications on. Additive only.
-- The push carries no payload; the service worker reads what the bell shows, so no key material is stored.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);
