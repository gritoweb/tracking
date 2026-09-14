-- Who a recurring template or an integration belongs to (D2): automatic entries get that author.
ALTER TABLE recurring_entries ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;
ALTER TABLE integrations ADD COLUMN user_id TEXT REFERENCES "user"(id) ON DELETE CASCADE;

-- Rows created before authorship was recorded go to the workspace owner.
UPDATE recurring_entries SET user_id = (
  SELECT m.userId FROM "member" m
  WHERE m.organizationId = recurring_entries.workspace_id
    AND instr(',' || m.role || ',', ',owner,') > 0
  ORDER BY m.createdAt LIMIT 1
)
WHERE user_id IS NULL;

UPDATE integrations SET user_id = (
  SELECT m.userId FROM "member" m
  WHERE m.organizationId = integrations.workspace_id
    AND instr(',' || m.role || ',', ',owner,') > 0
  ORDER BY m.createdAt LIMIT 1
)
WHERE user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring_entries(workspace_id, user_id);
-- A calendar connection is one person's: at most one per provider per person.
CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_calendar_user
  ON integrations(workspace_id, user_id, type)
  WHERE type IN ('google_calendar', 'microsoft_calendar');
