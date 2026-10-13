-- The currency the client PDFs are billed in; NULL = the default in code (BRL). Additive: no existing row changes.
ALTER TABLE report_settings ADD COLUMN currency TEXT;
