-- The Assistant chat is per person since D2, so what it remembers is too.
ALTER TABLE assistant_memory ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;

-- Facts saved while memory was shared by the workspace go to its owner.
UPDATE assistant_memory SET user_id = (
  SELECT m.userId FROM "member" m
  WHERE m.organizationId = assistant_memory.workspace_id
    AND instr(',' || m.role || ',', ',owner,') > 0
  ORDER BY m.createdAt LIMIT 1
)
WHERE user_id IS NULL;
DELETE FROM assistant_memory WHERE user_id IS NULL;

DROP INDEX IF EXISTS idx_assistant_memory_ws_key;
DROP INDEX IF EXISTS idx_assistant_memory_ws_updated;
CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_memory_user_key ON assistant_memory (workspace_id, user_id, key);
CREATE INDEX IF NOT EXISTS idx_assistant_memory_user_updated ON assistant_memory (workspace_id, user_id, updated_at);
