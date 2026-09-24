import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { attachmentDisposition, attachmentsRouter } from "./attachments";
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

const fakeCtx = {
  waitUntil: (p: Promise<unknown>) => {
    p.catch((err) => console.error("background waitUntil task rejected in test", err));
  },
  passThroughOnException: () => {},
} as unknown as ExecutionContext;

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

describe("GET /:id (SEC-7: an explicit disposition and a name that cannot break the header)", () => {
  it("serves the stored image inline with its name", async () => {
    const { env } = fakeEnv({ first: () => ({ r2_key: "k", content_type: "image/png", filename: "screenshot.png" }) });
    (env as unknown as { ATTACHMENTS: unknown }).ATTACHMENTS = { get: async () => ({ body: new Uint8Array([1, 2, 3]) }) };
    const res = await mountedApp("user-1").request("/att-1", {}, env, fakeCtx);
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("Content-Disposition")).toBe(`inline; filename="screenshot.png"; filename*=UTF-8''screenshot.png`);
  });

  it("does not serve an attachment that belongs to another workspace", async () => {
    const { env } = fakeEnv({ first: () => null });
    const res = await mountedApp("user-1").request("/att-1", {}, env, fakeCtx);
    expect(res.status).toBe(404);
  });
});

describe("attachmentDisposition", () => {
  it("keeps a non-ASCII name in the encoded form and an ASCII fallback beside it", () => {
    expect(attachmentDisposition("relatório ✓.png")).toBe(
      `inline; filename="relat_rio _.png"; filename*=UTF-8''relat%C3%B3rio%20%E2%9C%93.png`
    );
  });

  it("drops quotes, slashes and line breaks so the name cannot end the header or point at a path", () => {
    const header = attachmentDisposition('a"\r\nX-Evil: 1/../b\\c.png');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toBe(`inline; filename="aX-Evil: 1..bc.png"; filename*=UTF-8''aX-Evil%3A%201..bc.png`);
  });

  it("falls back to a fixed name when nothing usable is left, and caps a very long one", () => {
    expect(attachmentDisposition('"/\\\n')).toBe(`inline; filename="attachment"; filename*=UTF-8''attachment`);
    expect(attachmentDisposition("x".repeat(500)).length).toBeLessThan(300);
  });
});
