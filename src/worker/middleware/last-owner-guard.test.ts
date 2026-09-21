import { Hono } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { describe, expect, it } from "vitest";
import { lastOwnerRaceGuard } from "./last-owner-guard";

// The real downstream is better-auth's own handler; this stub reproduces just what
// better-call's router does when migration 0051's trigger aborts the losing side
// of a race (an empty 500), and the ordinary success/failure shapes it returns otherwise.
function appWith(status: number, body: unknown = null) {
  return new Hono()
    .use("/target", lastOwnerRaceGuard)
    .all("/target", (c) => (body === null ? new Response(null, { status }) : c.json(body, status as ContentfulStatusCode)));
}

describe("lastOwnerRaceGuard", () => {
  it("turns the trigger's bare 500 into the same clean error better-auth's sequential check gives", async () => {
    const res = await appWith(500).request("/target", { method: "POST" });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      message: "You cannot leave the organization without an owner",
      code: "YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER",
    });
  });

  it("leaves a successful response untouched", async () => {
    const res = await appWith(200, { role: "member" }).request("/target", { method: "POST" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ role: "member" });
  });

  it("leaves a real 4xx from the endpoint (e.g. sole-owner leave) untouched", async () => {
    const res = await appWith(400, { code: "YOU_CANNOT_LEAVE_THE_ORGANIZATION_WITHOUT_AN_OWNER" }).request("/target", { method: "POST" });
    expect(res.status).toBe(400);
  });
});
