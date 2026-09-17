import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApiError, api } from "./api-client";

// idb's openDB needs a real IndexedDB, which neither vitest environment provides.
const addPendingMutation = vi.fn();
vi.mock("@/lib/idb", () => ({ addPendingMutation: (...args: unknown[]) => addPendingMutation(...args) }));

// Real @hono/zod-validator rejection shape (`c.json(schema.safeParse(...), 400)`), built with the project's own zod.
function realZodRejectionBody(message: string): string {
  const schema = z
    .object({ since: z.string(), until: z.string() })
    .refine((v) => v.since < v.until, { message });
  const result = schema.safeParse({ since: "2026-01-02", until: "2026-01-01" });
  return JSON.stringify({ success: false, error: result.error });
}

function mockFetchOnce(response: Partial<Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      text: async () => "",
      json: async () => undefined,
      ...response,
    })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  addPendingMutation.mockClear();
});

// `api.me()` is the thinnest endpoint — exercising it is exercising `appFetch`
// itself, the one place every request goes through (credentials, the client-id
// header, the offline queue and `ApiError` mapping).
describe("api.me (via appFetch)", () => {
  it("resolves with the parsed JSON body on success", async () => {
    mockFetchOnce({ json: async () => ({ userId: "u1", workspaceId: "w1", role: "owner", canManage: true }) });
    await expect(api.me()).resolves.toEqual({
      userId: "u1",
      workspaceId: "w1",
      role: "owner",
      canManage: true,
    });
  });

  it("returns undefined for a 204 response", async () => {
    mockFetchOnce({ status: 204 });
    await expect(api.me()).resolves.toBeUndefined();
  });

  it("rejects with an ApiError carrying the server's plain error text", async () => {
    mockFetchOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      text: async () => JSON.stringify({ error: "Workspace not found" }),
    });
    await expect(api.me()).rejects.toMatchObject({
      name: "ApiError",
      message: "Workspace not found",
      status: 404,
    });
  });

  it("rejects with the first issue's message from a real serialized zod rejection", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      text: async () => realZodRejectionBody("Stop time must be after start time"),
    });
    await expect(api.me()).rejects.toMatchObject({
      message: "Stop time must be after start time",
      status: 400,
    });
  });

  it("falls back to the raw body, clipped to 300 chars, when it isn't JSON", async () => {
    const raw = "x".repeat(400);
    mockFetchOnce({ ok: false, status: 500, statusText: "Internal Server Error", text: async () => raw });
    const error = (await api.me().catch((e: unknown) => e)) as ApiError;
    expect(error.message).toBe(raw.slice(0, 300));
    expect(error.message).toHaveLength(300);
  });

  it("falls back to statusText when the body is empty", async () => {
    mockFetchOnce({ ok: false, status: 503, statusText: "Service Unavailable", text: async () => "" });
    await expect(api.me()).rejects.toMatchObject({ message: "Service Unavailable", status: 503 });
  });

  it("prefers a JSON error's plain string over falling through to raw text", async () => {
    mockFetchOnce({
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
      text: async () => JSON.stringify({ error: "Duplicate tag name" }),
    });
    await expect(api.me()).rejects.toMatchObject({ message: "Duplicate tag name" });
  });

  it("queues a mutating request and rejects with a queued ApiError when the network is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(
      api.tags.update("t1", { color: "#ffffff" })
    ).rejects.toMatchObject({
      name: "ApiError",
      message: "Offline — saved locally, will sync when you reconnect",
      status: 0,
      queued: true,
    });
    expect(addPendingMutation).toHaveBeenCalledWith({
      method: "PATCH",
      url: "/api/tags/t1",
      body: { color: "#ffffff" },
    });
  });

  it("does not queue a GET on network failure — it just rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(api.me()).rejects.toBeInstanceOf(TypeError);
  });
});

describe("ApiError", () => {
  it("carries status and the queued flag", () => {
    const error = new ApiError("Offline — saved locally, will sync when you reconnect", 0, true);
    expect(error.status).toBe(0);
    expect(error.queued).toBe(true);
    expect(error.name).toBe("ApiError");
  });

  it("defaults queued to false", () => {
    expect(new ApiError("boom", 500).queued).toBe(false);
  });
});
