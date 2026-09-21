import { createMiddleware } from "hono/factory";
import { createAuth } from "../auth";

// Better Auth's `session.freshAge` is set to 0 (see auth.ts) so the read-only
// Settings → Active Sessions card (GET /list-sessions) keeps working for
// returning users — Better Auth otherwise 403s that endpoint once a session is
// older than freshAge, and there is no per-endpoint override in config.
//
// The cost of that global 0 is that Better Auth ALSO drops its fresh-session
// requirement from the sensitive mutations: /update-user, /unlink-account,
// /delete-user, and revoke-session(s)/revoke-other-sessions (all of them read
// the same freshAge via sensitiveSessionMiddleware/requireFreshSession
// internally). With freshAge 0, Better Auth skips deletion freshness
// entirely and any session — however old or partially leaked — could kill
// every other session/device with no re-auth (SECURITY.md S-04/S-07). This
// middleware re-imposes freshness on all six endpoints (wired in index.ts).
// change-password is unaffected: it keeps its own current-password check.
const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000; // mirrors Better Auth's default freshAge (1 day)

export const requireFreshSession = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  const origin = new URL(c.req.url).origin;
  const auth = createAuth(c.env, origin);

  // disableCookieCache: this gate protects account deletion — a stale signed
  // cookie cache must never stand in for a real, still-existing session row
  // (SECURITY.md S-04).
  const result = await auth.api.getSession({
    headers: c.req.raw.headers,
    query: { disableCookieCache: true },
  });
  if (!result) return c.json({ error: "Unauthorized" }, 401);

  const createdAt = new Date(result.session.createdAt).getTime();
  if (Number.isFinite(createdAt) && Date.now() - createdAt >= FRESH_WINDOW_MS) {
    return c.json(
      {
        error: "Please sign in again before changing these account settings.",
        code: "SESSION_NOT_FRESH",
      },
      403,
    );
  }

  await next();
});
