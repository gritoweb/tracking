-- An organization keeps at least one owner: better-auth counts owners and then writes, so two owners stepping down at once could both pass (SECURITY.md S-29).
CREATE TRIGGER IF NOT EXISTS member_keep_one_owner_on_update
BEFORE UPDATE OF role, organizationId ON "member"
WHEN (',' || replace(OLD.role, ' ', '') || ',') LIKE '%,owner,%'
  AND ((',' || replace(NEW.role, ' ', '') || ',') NOT LIKE '%,owner,%' OR NEW.organizationId <> OLD.organizationId)
  AND NOT EXISTS (
    SELECT 1 FROM "member"
    WHERE organizationId = OLD.organizationId AND id <> OLD.id AND (',' || replace(role, ' ', '') || ',') LIKE '%,owner,%'
  )
BEGIN
  SELECT RAISE(ABORT, 'An organization needs at least one owner (last owner)');
END;

-- The EXISTS on workspaces/user lets the ON DELETE CASCADE from a deleted organization or user through; only a direct row delete is refused.
CREATE TRIGGER IF NOT EXISTS member_keep_one_owner_on_delete
BEFORE DELETE ON "member"
WHEN (',' || replace(OLD.role, ' ', '') || ',') LIKE '%,owner,%'
  AND EXISTS (SELECT 1 FROM workspaces WHERE id = OLD.organizationId)
  AND EXISTS (SELECT 1 FROM "user" WHERE id = OLD.userId)
  AND NOT EXISTS (
    SELECT 1 FROM "member"
    WHERE organizationId = OLD.organizationId AND id <> OLD.id AND (',' || replace(role, ' ', '') || ',') LIKE '%,owner,%'
  )
BEGIN
  SELECT RAISE(ABORT, 'An organization needs at least one owner (last owner)');
END;
