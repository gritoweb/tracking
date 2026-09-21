import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { corsMiddleware, isAllowedOrigin } from "./cors";

const env = { APP_URL: "https://tracking.example.com" } as unknown as Env;
const app = new Hono<{ Bindings: Env }>().use("*", corsMiddleware).get("/x", (c) => c.text("ok"));
const allowOrigin = async (origin?: string) =>
  (await app.request("/x", origin ? { headers: { Origin: origin } } : {}, env)).headers.get("Access-Control-Allow-Origin");

describe("CORS", () => {
  it("echoes the app's own origin", async () => {
    expect(await allowOrigin("https://tracking.example.com")).toBe("https://tracking.example.com");
  });

  it("gives a foreign origin no permission", async () => {
    expect(await allowOrigin("https://evil.example")).toBeNull();
  });

  it("does not match by prefix or suffix", async () => {
    expect(await allowOrigin("https://tracking.example.com.evil.example")).toBeNull();
    expect(await allowOrigin("https://evil-tracking.example.com")).toBeNull();
  });

  it("sends no wildcard when the request carries no Origin", async () => {
    expect(await allowOrigin()).toBeNull();
  });

  it("exposes the same check for the /mcp endpoint", () => {
    expect(isAllowedOrigin(env, "https://tracking.example.com")).toBe(true);
    expect(isAllowedOrigin(env, "https://evil.example")).toBe(false);
  });
});
