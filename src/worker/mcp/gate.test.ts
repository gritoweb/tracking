import { describe, expect, it, vi } from "vitest";
import { mcpGate } from "./gate";

const env = (extra: object = {}) => ({ APP_URL: "https://tracking.example.com", ...extra }) as unknown as Env;
const request = (headers: Record<string, string> = {}) => new Request("https://tracking.example.com/mcp", { method: "POST", headers });
// Counters are kept for the whole file, so each test uses an address of its own.
const from = (ip: string, extra: Record<string, string> = {}) => request({ "cf-connecting-ip": ip, ...extra });

describe("mcpGate", () => {
  it("lets an MCP client through: no Origin, under the limit", async () => {
    expect(await mcpGate(from("20.0.0.1"), env(), { max: 5 })).toBeNull();
  });

  it("lets the app's own origin through", async () => {
    expect(await mcpGate(from("20.0.0.2", { Origin: "https://tracking.example.com" }), env(), { max: 5 })).toBeNull();
  });

  it("refuses a browser page from another origin with 403", async () => {
    const res = await mcpGate(from("20.0.0.3", { Origin: "https://evil.example" }), env(), { max: 5 });
    expect(res?.status).toBe(403);
    expect(await res?.json()).toEqual({ error: "Forbidden origin" });
  });

  it("does not spend the shared counter on a request it refuses for its origin", async () => {
    const limiter = { limit: vi.fn(async () => ({ success: true })) };
    await mcpGate(from("20.0.0.4", { Origin: "https://evil.example" }), env({ MCP_LIMITER: limiter }), { max: 5, shared: "MCP_LIMITER" });
    expect(limiter.limit).not.toHaveBeenCalled();
  });

  it("answers 429 with Retry-After past the per-address limit, without needing a key", async () => {
    for (let i = 0; i < 2; i++) expect(await mcpGate(from("20.0.0.5"), env(), { max: 2 })).toBeNull();
    const res = await mcpGate(from("20.0.0.5"), env(), { max: 2 });
    expect(res?.status).toBe(429);
    expect(Number(res?.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(res?.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers 429 when the shared counter says the address is over", async () => {
    const limiter = { limit: vi.fn(async () => ({ success: false })) };
    const res = await mcpGate(from("20.0.0.6"), env({ MCP_LIMITER: limiter }), { max: 5, shared: "MCP_LIMITER" });
    expect(res?.status).toBe(429);
    expect(limiter.limit).toHaveBeenCalledWith({ key: "/mcp:20.0.0.6" });
  });
});
