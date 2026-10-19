-- A client's own invoice currency; NULL = the workspace's (report_settings.currency). Additive: no existing row changes.
ALTER TABLE clients ADD COLUMN currency TEXT;
