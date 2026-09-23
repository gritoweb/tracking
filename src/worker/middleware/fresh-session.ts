import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth";

// freshAge:0 (kept for the sessions card, see auth.ts) also drops Better Auth's own gate on delete/revoke — SECURITY.md S-04/S-07.
const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000; // mirrors Better Auth's default freshAge (1 day)

export const requireFreshSession = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const origin = new URL(c.req.url).origin;
  const auth = createAuth(c.env, origin);

  // disableCookieCache: never trust a stale signed cookie here — SECURITY.md S-04.
  const result = await auth.api.getSession({
    headers: c.req.raw.headers,
    query: { disableCookieCache: true },
  });
  if (!result) return c.json({ error: "Unauthorized", message: "Unauthorized" }, 401);

  const createdAt = new Date(result.session.createdAt).getTime();
  if (Number.isFinite(createdAt) && Date.now() - createdAt >= FRESH_WINDOW_MS) {
    return c.json(
      {
        error: "Please sign in again before changing these account settings.",
        // The auth client surfaces `message`; without it the screen showed a bare "Failed to …".
        message: "Please sign in again before changing these account settings.",
        code: "SESSION_NOT_FRESH",
      },
      403,
    );
  }

  await next();
});
