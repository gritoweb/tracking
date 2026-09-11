import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth";

type ResolvedWorkspace =
  | { ok: true; workspaceId: string; userId: string }
  | { ok: false; status: 401 | 404 };

/**
 * Resolve and VERIFY the caller's active workspace from their session (cookie
 * or bearer). `activeOrganizationId` rides the session row (and the 5-min
 * cookie cache), but membership can be revoked at any time — Better Auth only
 * clears activeOrganizationId when a user removes *themselves* from an org, so
 * an owner kicking a member would otherwise leave that member with full access
 * until their session expires. Membership is therefore re-verified against
 * `member` on every request (one indexed D1 lookup); a no-longer-member falls
 * back to their first remaining organization.
 *
 * Shared by workspaceMiddleware (/api/*) and the /agents/* gate in index.ts.
 */
export async function resolveWorkspace(env: Env, request: Request): Promise<ResolvedWorkspace> {
  const origin = new URL(request.url).origin;
  const auth = createAuth(env, origin);

  const result = await auth.api.getSession({ headers: request.headers });
  if (!result) return { ok: false, status: 401 };
  const { session, user } = result;

  let workspaceId = session.activeOrganizationId ?? null;
  if (workspaceId) {
    const member = await env.DB.prepare(
      `SELECT 1 FROM "member" WHERE userId = ? AND organizationId = ? LIMIT 1`,
    )
      .bind(user.id, workspaceId)
      .first();
    if (!member) workspaceId = null;
  }

  if (!workspaceId) {
    const orgs = await auth.api.listOrganizations({ headers: request.headers });
    if (orgs.length === 0) return { ok: false, status: 404 };

    const lastActive = await env.DB
      .prepare(`SELECT last_active_organization_id FROM "user" WHERE id = ?`)
      .bind(user.id)
      .first<{ last_active_organization_id: string | null }>();
    const preferred = lastActive?.last_active_organization_id;

    workspaceId = orgs.find((o) => o.id === preferred)?.id ?? orgs[0].id;
    await auth.api.setActiveOrganization({
      body: { organizationId: workspaceId },
      headers: request.headers,
    });
    if (workspaceId !== preferred) {
      await env.DB
        .prepare(`UPDATE "user" SET last_active_organization_id = ? WHERE id = ?`)
        .bind(workspaceId, user.id)
        .run();
    }
  }

  return { ok: true, workspaceId, userId: user.id };
}

export const workspaceMiddleware = createMiddleware<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>(async (c, next) => {
  const resolved = await resolveWorkspace(c.env, c.req.raw);
  if (!resolved.ok) {
    return c.json(
      { error: resolved.status === 401 ? "Unauthorized" : "Workspace not found" },
      resolved.status,
    );
  }

  c.set("workspaceId", resolved.workspaceId);
  c.set("userId", resolved.userId);
  await next();
});
