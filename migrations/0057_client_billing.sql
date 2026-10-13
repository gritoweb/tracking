-- Invoice billing: a client's own hourly rate (NULL = the workspace default), the workspace default, and a client's fixed services. Additive: no existing row changes.
ALTER TABLE clients ADD COLUMN rate REAL;
ALTER TABLE workspaces ADD COLUMN default_rate REAL;

CREATE TABLE IF NOT EXISTS client_services (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id    TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  amount       REAL NOT NULL,
  billable     INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_client_services_client ON client_services(client_id);
