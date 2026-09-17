-- Who created a task (SEC-2's "author or manager" delete rule needs someone to check);
-- left NULL on existing rows on purpose, so an old task without an author falls back to manager-only.
ALTER TABLE tasks ADD COLUMN created_by TEXT REFERENCES "user"(id) ON DELETE SET NULL;
