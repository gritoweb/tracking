-- The highest invoice number generated ("9", "2026-09"); the next invoice is offered the one after it.
ALTER TABLE report_settings ADD COLUMN last_invoice_number TEXT;
