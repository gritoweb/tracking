import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { attachmentsRouter } from "./attachments";
import { createD1Stub, type D1StubHandlers } from "../../test/d1-stub";

function mountedApp(userId: string) {
  return new Hono<{ Bindings: Env; Variables: { workspaceId: string; userId: string } }>()
    .use("*", async (c, next) => {
      c.set("workspaceId", "workspace-A");
      c.set("userId", userId);
      await next();
    })
    .route("/", attachmentsRouter);
}

function fakeEnv(handlers: D1StubHandlers) {
  const { db, calls } = createD1Stub(handlers);
  return { env: { DB: db, ATTACHMENTS: { delete: async () => {} } } as unknown as Env, calls };
}

const fakeCtx = { waitUntil: (p: Promise<unknown>) => { p.catch(() => {}); }, passThroughOnException: () => {} } as unknown as ExecutionContext;

describe("DELETE /:id (SEC-2: author or manager only)", () => {
  it("403s a plain member who neither uploaded the attachment nor manages the workspace", async () => {
    const { env } = fakeEnv({
      first: (call) =>
        call.sql.includes("task_attachments") ? { r2_key: "k", user_id: "uploader-1" } : { role: "member" },
    });
    const res = await mountedApp("someone-else").request("/att-1", { method: "DELETE" }, env, fakeCtx);
    expect(res.status).toBe(403);
  });

  it("lets the uploader delete their own attachment", async () => {
    const { env } = fakeEnv({
      first: (call) =>
        call.sql.includes("task_attachments") ? { r2_key: "k", user_id: "uploader-1" } : { role: "member" },
      run: () => ({ success: true }),
    });
    const res = await mountedApp("uploader-1").request("/att-1", { method: "DELETE" }, env, fakeCtx);
    expect(res.status).toBe(200);
  });

  it("lets a manager delete an attachment they didn't upload", async () => {
    const { env } = fakeEnv({
      first: (call) =>
        call.sql.includes("task_attachments") ? { r2_key: "k", user_id: "uploader-1" } : { role: "admin" },
      run: () => ({ success: true }),
    });
    const res = await mountedApp("admin-1").request("/att-1", { method: "DELETE" }, env, fakeCtx);
    expect(res.status).toBe(200);
  });
});
