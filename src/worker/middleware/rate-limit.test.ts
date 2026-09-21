import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import { limitRequest, rateLimit } from "./rate-limit";

// The counters live for the whole test file, so each test uses an address of its own.
function appWith(max: number, shared?: "AUTH_LIMITER") {
  return new Hono<{ Bindings: Env }>().use("*", rateLimit(max, 60_000, shared)).get("/x", (c) => c.text("ok"));
}
const from = (ip: string) => ({ headers: { "cf-connecting-ip": ip } });
const fakeLimiter = (success: boolean) => ({ limit: vi.fn<(options: { key: string }) => Promise<{ success: boolean }>>(async () => ({ success })) });

afterEach(() => vi.useRealTimers());

describe("rateLimit (per isolate)", () => {
  it("lets requests through up to the limit, then answers 429 with Retry-After", async () => {
    const app = appWith(3);
    for (let i = 0; i < 3; i++) expect((await app.request("/x", from("10.0.0.1"), {} as Env)).status).toBe(200);
    const blocked = await app.request("/x", from("10.0.0.1"), {} as Env);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
  });

  it("counts each address separately", async () => {
    const app = appWith(1);
    expect((await app.request("/x", from("10.0.1.1"), {} as Env)).status).toBe(200);
    expect((await app.request("/x", from("10.0.1.1"), {} as Env)).status).toBe(429);
    expect((await app.request("/x", from("10.0.1.2"), {} as Env)).status).toBe(200);
  });

  it("starts counting again once the window has passed", async () => {
    vi.useFakeTimers();
    const app = appWith(1);
    expect((await app.request("/x", from("10.0.2.1"), {} as Env)).status).toBe(200);
    expect((await app.request("/x", from("10.0.2.1"), {} as Env)).status).toBe(429);
    vi.advanceTimersByTime(61_000);
    expect((await app.request("/x", from("10.0.2.1"), {} as Env)).status).toBe(200);
  });
});

describe("rateLimit (shared across isolates)", () => {
  it("refuses when the shared counter says so, even though this isolate has seen one request", async () => {
    const limiter = fakeLimiter(false);
    const res = await appWith(10, "AUTH_LIMITER").request("/x", from("10.0.3.1"), { AUTH_LIMITER: limiter } as unknown as Env);
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(limiter.limit).toHaveBeenCalledWith({ key: "/x:10.0.3.1" });
  });

  it("lets the request go when the shared counter allows it", async () => {
    const limiter = fakeLimiter(true);
    const res = await appWith(10, "AUTH_LIMITER").request("/x", from("10.0.4.1"), { AUTH_LIMITER: limiter } as unknown as Env);
    expect(res.status).toBe(200);
  });

  it("does not ask the shared counter once the local one has already refused", async () => {
    const limiter = fakeLimiter(true);
    const env = { AUTH_LIMITER: limiter } as unknown as Env;
    const app = appWith(1, "AUTH_LIMITER");
    await app.request("/x", from("10.0.5.1"), env);
    await app.request("/x", from("10.0.5.1"), env);
    expect(limiter.limit).toHaveBeenCalledTimes(1);
  });

  it("works without the binding (dev, tests) and keeps the local limit", async () => {
    const app = appWith(1, "AUTH_LIMITER");
    expect((await app.request("/x", from("10.0.6.1"), {} as Env)).status).toBe(200);
    expect((await app.request("/x", from("10.0.6.1"), {} as Env)).status).toBe(429);
  });

  it("goes on with the local count when the shared limiter breaks, and says so in the log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const limiter = { limit: vi.fn(async () => { throw new Error("binding down"); }) };
    const retryAfter = await limitRequest({ AUTH_LIMITER: limiter } as unknown as Env, { key: "k:10.0.7.1", max: 5, windowMs: 60_000, shared: "AUTH_LIMITER" });
    expect(retryAfter).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});
