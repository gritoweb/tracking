import type { Context } from "hono";
import { createAuth } from "../auth";
import { deactivateAccount, soleOwnedWorkspaces } from "../lib/account-deactivation";

/** Serves Better Auth's /delete-user path so self-service "delete account" deactivates instead of deleting. */
export async function deactivateSelf(c: Context<{ Bindings: Env }>) {
  const auth = createAuth(c.env, new URL(c.req.url).origin);
  const result = await auth.api.getSession({ headers: c.req.raw.headers, query: { disableCookieCache: true } });
  if (!result) return c.json({ message: "Unauthorized", code: "UNAUTHORIZED" }, 401);

  const sole = await soleOwnedWorkspaces(c.env.DB, result.user.id);
  if (sole.length > 0) {
    return c.json(
      { message: `You're the only owner of ${sole.join(", ")}. Make someone else an owner first.`, code: "LAST_OWNER" },
      409
    );
  }

  await deactivateAccount(c.env.DB, result.user.id);
  return c.json({ success: true, message: "Account deactivated" });
}

/** Better Auth's admin hard delete is closed: removing a person goes through the app's deactivation route. */
export function refuseHardDelete(c: Context<{ Bindings: Env }>) {
  return c.json({ message: "Accounts are deactivated, never deleted.", code: "ACCOUNT_DELETION_DISABLED" }, 403);
}
