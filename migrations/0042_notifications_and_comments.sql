-- Per-user notifications (delivered live via the NotificationRoom DO, one per user) and
-- flat, single-level task comments — no reply/thread, same as a WhatsApp group chat.

CREATE TABLE IF NOT EXISTS notifications (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  type         TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,
  -- Where clicking the notification goes, e.g. /tasks/:id — app-relative, never a full URL.
  link         TEXT,
  is_read      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
  ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON notifications(user_id, is_read) WHERE is_read = 0;

CREATE TABLE IF NOT EXISTS task_comments (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  task_id      TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  body         TEXT NOT NULL,
  -- Comma-separated user ids @mentioned in this comment — who notifyMentions notifies.
  mentioned_user_ids TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  edited_at    TEXT
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task
  ON task_comments(task_id, created_at ASC);
