-- Branding of the client PDFs (invoice, hours report), one row per workspace; no row = the defaults in code.
CREATE TABLE IF NOT EXISTS report_settings (
  workspace_id      TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  company_name      TEXT,
  company_email     TEXT,
  color_primary     TEXT,
  color_accent      TEXT,
  color_text        TEXT,
  logo_r2_key       TEXT,
  logo_content_type TEXT,
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
