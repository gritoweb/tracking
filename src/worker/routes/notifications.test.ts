import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { notificationsRouter } from "./notifications";
import { createD1Stub } from "../../test/d1-stub";

/** Mounts the router behind the same two context variables `workspaceMiddleware` provides in production. */
function mountedApp() {
  return new Hono<{ Bindings: Env; Variables: { workspaceId: string; userId: string } }>()
    .use("*", async (c, next) => {
      c.set("workspaceId", "workspace-A");
      c.set("userId", "user-1");
      await next();
    })
    .route("/", notificationsRouter);
}

describe("notificationsRouter workspace scoping (P0-4)", () => {
  it("GET / scopes both the list and the unread count by workspace, not just user", async () => {
    const { db, calls } = createD1Stub({ all: () => ({ results: [] }), first: () => ({ n: 0 }) });
    const res = await mountedApp().request("/", {}, { DB: db } as unknown as Env);
    expect(res.status).toBe(200);
    const listCall = calls.find((c) => c.sql.includes("SELECT * FROM notifications"));
    const countCall = calls.find((c) => c.sql.includes("COUNT(*)"));
    expect(listCall?.sql).toContain("workspace_id = ?");
    expect(listCall?.params).toEqual(["user-1", "workspace-A"]);
    expect(countCall?.sql).toContain("workspace_id = ?");
    expect(countCall?.params).toEqual(["user-1", "workspace-A"]);
  });

  it("PATCH /:id/read scopes the update by workspace", async () => {
    const { db, calls } = createD1Stub({ run: () => ({ success: true }) });
    await mountedApp().request("/n1/read", { method: "PATCH" }, { DB: db } as unknown as Env);
    expect(calls[0]?.sql).toContain("workspace_id = ?");
    expect(calls[0]?.params).toEqual(["n1", "user-1", "workspace-A"]);
  });

  it("PATCH /read-all scopes the bulk update by workspace", async () => {
    const { db, calls } = createD1Stub({ run: () => ({ success: true }) });
    await mountedApp().request("/read-all", { method: "PATCH" }, { DB: db } as unknown as Env);
    expect(calls[0]?.sql).toContain("workspace_id = ?");
    expect(calls[0]?.params).toEqual(["user-1", "workspace-A"]);
  });

  it("DELETE /:id scopes the delete by workspace, so a stale id from another workspace never matches", async () => {
    const { db, calls } = createD1Stub({ run: () => ({ success: true }) });
    await mountedApp().request("/n1", { method: "DELETE" }, { DB: db } as unknown as Env);
    expect(calls[0]?.sql).toContain("workspace_id = ?");
    expect(calls[0]?.params).toEqual(["n1", "user-1", "workspace-A"]);
  });

  it("DELETE / (clear all) scopes by workspace, leaving other workspaces' notifications untouched", async () => {
    const { db, calls } = createD1Stub({ run: () => ({ success: true }) });
    await mountedApp().request("/", { method: "DELETE" }, { DB: db } as unknown as Env);
    expect(calls[0]?.sql).toContain("workspace_id = ?");
    expect(calls[0]?.params).toEqual(["user-1", "workspace-A"]);
  });
});
