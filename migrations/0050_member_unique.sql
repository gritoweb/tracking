-- A person is a member of a workspace once: without this a repeated seed or backfill left two rows for the same pair.
CREATE UNIQUE INDEX IF NOT EXISTS idx_member_org_user ON "member"(organizationId, userId);
