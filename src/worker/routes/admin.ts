import { Hono } from "hono";
import { APIError } from "better-auth";
import { createAuth } from "../auth";
import { DEACTIVATED_REASON, deactivateAccount, soleOwnedWorkspaces } from "../lib/account-deactivation";

// Admin-only user removal: deactivates the account (lib/account-deactivation.ts), so no workspace and no record is ever deleted.
export const adminRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>().delete("/users/:id", async (c) => {
  const targetId = c.req.param("id");
  if (targetId === c.get("userId")) {
    return c.json({ error: "You can't remove your own account from here" }, 400);
  }

  // Admin first: the sole-owner answer below names workspaces, which a non-admin must not learn.
  const auth = createAuth(c.env, new URL(c.req.url).origin);
  const caller = await auth.api.getSession({ headers: c.req.raw.headers, query: { disableCookieCache: true } });
  const roles = String(caller?.user.role ?? "").split(",").map((r) => r.trim());
  if (!roles.includes("admin")) return c.json({ error: "Only an admin can remove users" }, 403);

  const sole = await soleOwnedWorkspaces(c.env.DB, targetId);
  if (sole.length > 0) {
    return c.json({ error: `They're the only owner of ${sole.join(", ")}. Make someone else an owner first.` }, 409);
  }

  // better-auth re-checks the admin role here too.
  try {
    await auth.api.banUser({ body: { userId: targetId, banReason: DEACTIVATED_REASON }, headers: c.req.raw.headers });
  } catch (err) {
    if (err instanceof APIError) {
      return c.json({ error: err.message }, (err.statusCode as 403) || 403);
    }
    return c.json({ error: "Failed to remove user" }, 500);
  }

  await deactivateAccount(c.env.DB, targetId);
  return c.json({ ok: true }, 200);
});
