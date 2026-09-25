-- Slack as a second delivery channel for the bell: a notification still unread after a delay is sent
-- to its person as a Slack DM (lib/slack.ts, cron). Additive only; no existing row is rewritten.

-- One Slack workspace per TimeTracker workspace, installed by an owner/admin through OAuth.
CREATE TABLE IF NOT EXISTS slack_installations (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id      TEXT NOT NULL,
  team_name    TEXT NOT NULL,
  bot_user_id  TEXT NOT NULL,
  -- AES-GCM encrypted JSON { botToken } (lib/crypto.ts) — never returned to the client.
  credentials  TEXT NOT NULL,
  installed_by TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cache of users.lookupByEmail: slack_user_id NULL means "no Slack user with this email", re-checked later.
CREATE TABLE IF NOT EXISTS slack_user_links (
  workspace_id  TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL,
  slack_user_id TEXT,
  checked_at    TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (workspace_id, user_id)
);

-- When the Slack sweep claimed this notification; NULL = not sent to Slack.
ALTER TABLE notifications ADD COLUMN slack_sent_at TEXT;

CREATE INDEX IF NOT EXISTS idx_notifications_slack_pending
  ON notifications(created_at) WHERE is_read = 0 AND slack_sent_at IS NULL;

-- Personal opt-out: 1 = unread notifications may reach this person on Slack.
ALTER TABLE "user" ADD COLUMN slack_notify INTEGER NOT NULL DEFAULT 1;
