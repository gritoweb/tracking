import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { createD1Stub, type D1StubHandlers } from "../../test/d1-stub";
import { savedReportsRouter } from "./saved-reports";

function mountedApp(handlers: D1StubHandlers) {
  const { db } = createD1Stub(handlers);
  const app = new Hono<{ Bindings: Env; Variables: { workspaceId: string; userId: string } }>()
    .use("*", async (c, next) => {
      c.set("workspaceId", "workspace-A");
      c.set("userId", "user-1");
      await next();
    })
    .route("/", savedReportsRouter);
  return { app, env: { DB: db } as unknown as Env };
}

describe("GET / — saved report config (TYPE-2: typed row, parsed via parseJsonColumn)", () => {
  it("parses a well-formed config object", async () => {
    const { app, env } = mountedApp({
      all: () => ({
        results: [
          { id: "r1", name: "My report", config: JSON.stringify({ group: "project" }), created_at: "now", updated_at: "now" },
        ],
      }),
    });
    const res = await app.request("/", {}, env);
    const body = (await res.json()) as Array<{ config: unknown }>;
    expect(body[0]?.config).toEqual({ group: "project" });
  });

  it("logs and falls back to {} rather than throwing on malformed config JSON", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { app, env } = mountedApp({
      all: () => ({
        results: [{ id: "r1", name: "My report", config: "not json", created_at: "now", updated_at: "now" }],
      }),
    });
    const res = await app.request("/", {}, env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Array<{ config: unknown }>;
    expect(body[0]?.config).toEqual({});
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
