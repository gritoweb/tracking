-- Saved invoices: the source of truth for what a client was billed, frozen with the lines, parties and total it was sent with. Additive: no existing row changes.
ALTER TABLE report_settings ADD COLUMN company_address TEXT;
ALTER TABLE report_settings ADD COLUMN company_phone TEXT;
-- Days between issue and due date last used on an invoice; NULL = the default in code.
ALTER TABLE report_settings ADD COLUMN invoice_due_days INTEGER;

CREATE TABLE IF NOT EXISTS invoices (
  id               TEXT PRIMARY KEY,
  workspace_id     TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id        TEXT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  number           TEXT NOT NULL,
  issue_date       TEXT NOT NULL,
  due_date         TEXT NOT NULL,
  period_from      TEXT NOT NULL,
  period_to        TEXT NOT NULL,
  currency         TEXT NOT NULL,
  locale           TEXT NOT NULL,
  lines            TEXT NOT NULL,
  total            REAL NOT NULL,
  notes            TEXT,
  client_snapshot  TEXT NOT NULL,
  company_snapshot TEXT NOT NULL,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(workspace_id, client_id, issue_date);
