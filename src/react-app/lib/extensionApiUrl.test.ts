import { beforeEach, describe, expect, it, vi } from "vitest";

// Lives under src/ because vitest only collects tests from there; the module under test is the extension's.
type Normalize = (input: string) => string | null;
let normalizeApiUrl: Normalize;

beforeEach(async () => {
  vi.resetModules();
  vi.stubEnv("VITE_APP_URL", "https://tracking.gritoweb.com.br");
  ({ normalizeApiUrl } = await import("../../../extension/lib/apiUrl"));
});

describe("extension API URL allow-list", () => {
  it.each([
    "https://x.workers.dev",
    "https://tracking.someone.workers.dev",
    "https://workers.dev",
    "https://phish.workers.dev.attacker.com",
    "http://x.workers.dev",
  ])("rejects %s", (url) => {
    expect(normalizeApiUrl(url)).toBeNull();
  });

  it("accepts the production origin and strips path and trailing slash", () => {
    expect(normalizeApiUrl("https://tracking.gritoweb.com.br/")).toBe("https://tracking.gritoweb.com.br");
    expect(normalizeApiUrl("https://tracking.gritoweb.com.br/api/x?y=1")).toBe("https://tracking.gritoweb.com.br");
  });

  it("accepts local development over plain http", () => {
    expect(normalizeApiUrl("http://localhost:5173")).toBe("http://localhost:5173");
    expect(normalizeApiUrl("http://127.0.0.1:8787")).toBe("http://127.0.0.1:8787");
  });

  it("still rejects plaintext production, lookalike hosts and garbage", () => {
    expect(normalizeApiUrl("http://tracking.gritoweb.com.br")).toBeNull();
    expect(normalizeApiUrl("https://tracking.gritoweb.com.br.evil.example")).toBeNull();
    expect(normalizeApiUrl("not a url")).toBeNull();
  });
});
