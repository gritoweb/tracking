-- A comment carries at most one attached image — the same upload pipeline as the
-- description's inline images, just linked from a comment row instead of embedded in a doc.
-- ON DELETE SET NULL: without it, deleting a referenced attachment (or its task) fails the FK check.
ALTER TABLE task_comments ADD COLUMN attachment_id TEXT REFERENCES task_attachments(id) ON DELETE SET NULL;
