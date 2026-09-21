import { createMiddleware } from "hono/factory";

// migration 0051's SQLite trigger aborts the losing side of a same-tick owner
// demote/remove race; better-call has no typed error for a raw D1 exception and
// returns an empty 500 (pentest follow-up to SECURITY.md S-29) — surface the
// same clean error better-auth's own sequential check gives instead.
export const lastOwnerRaceGuard = createMiddleware<{ Bindings: Env }>(async (c, next) => {
  await next();
  if (c.res.status === 500) {
    c.res = c.json(
      {
        message: "You cannot leave the organization without an owner",
        code: "YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER",
      },
      400,
    );
  }
});
