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

describe("POST / — config size (S-31)", () => {
  const post = (config: unknown) => {
    const { app, env } = mountedApp({ run: () => ({ meta: { changes: 1 } }), first: () => ({ id: "r1", name: "n", config: "{}", created_at: "now", updated_at: "now" }) });
    return app.request("/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "big", config }) }, env);
  };
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  // Shape the app really saves (useSavedReports.ts), with a filter list far larger than a person picks.
  const realistic = (n: number) => ({
    range: { since: "2026-01-01T00:00:00.000Z", until: "2026-02-01T00:00:00.000Z", label: "This month" },
    filters: { clientIds: ids(n), projectIds: ids(n), taskIds: ids(n), tagIds: ids(n), userIds: ids(n), billable: "all", search: "" },
    rounding: { mode: "off", minutes: 0 },
    group: "project",
    subGroup: "none",
  });

  it("refuses a multi-megabyte config", async () => {
    expect((await post({ blob: "x".repeat(2_000_000) })).status).toBe(400);
  });

  it("accepts a real config, even with 200 ids in every filter", async () => {
    expect((await post(realistic(3))).status).toBe(201);
    expect((await post(realistic(200))).status).toBe(201);
  });
});
