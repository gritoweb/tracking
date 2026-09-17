// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PendingMutation } from "@/lib/idb";
import { drainQueue, MAX_REPLAY_ATTEMPTS } from "./useOfflineSync";

const getPendingMutations = vi.fn();
const deletePendingMutation = vi.fn();
const incrementPendingMutationAttempts = vi.fn();
vi.mock("@/lib/idb", () => ({
  getPendingMutations: (...args: unknown[]) => getPendingMutations(...args),
  deletePendingMutation: (...args: unknown[]) => deletePendingMutation(...args),
  incrementPendingMutationAttempts: (...args: unknown[]) => incrementPendingMutationAttempts(...args),
}));

const toastApiError = vi.fn();
vi.mock("@/lib/toastApiError", () => ({
  toastApiError: (...args: unknown[]) => toastApiError(...args),
}));

function pending(overrides: Partial<PendingMutation> = {}): PendingMutation {
  return {
    id: 1,
    method: "PUT",
    url: "/api/time_entries/e1",
    body: { description: "updated" },
    createdAt: Date.now(),
    attempts: 0,
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("drainQueue", () => {
  it("removes a mutation that replays successfully and reports nothing", async () => {
    getPendingMutations.mockResolvedValue([pending()]);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    await drainQueue();

    expect(deletePendingMutation).toHaveBeenCalledWith(1);
    expect(toastApiError).not.toHaveBeenCalled();
  });

  it("drops a 4xx reply and tells the user, instead of retrying it forever", async () => {
    getPendingMutations.mockResolvedValue([pending()]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        text: async () => JSON.stringify({ error: "Stop time must be after start time" }),
      })
    );

    await drainQueue();

    expect(deletePendingMutation).toHaveBeenCalledWith(1);
    expect(incrementPendingMutationAttempts).not.toHaveBeenCalled();
    expect(toastApiError).toHaveBeenCalledTimes(1);
    expect(toastApiError.mock.calls[0][0]).toMatchObject({
      message: "Stop time must be after start time",
      status: 400,
    });
  });

  it("keeps a 5xx reply in the queue while under the attempt limit", async () => {
    getPendingMutations.mockResolvedValue([pending()]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error", text: async () => "" })
    );
    incrementPendingMutationAttempts.mockResolvedValue(MAX_REPLAY_ATTEMPTS - 1);

    await drainQueue();

    expect(deletePendingMutation).not.toHaveBeenCalled();
    expect(toastApiError).not.toHaveBeenCalled();
  });

  it("drops a 5xx reply and tells the user once the attempt limit is reached", async () => {
    getPendingMutations.mockResolvedValue([pending()]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 500, statusText: "Internal Server Error", text: async () => "" })
    );
    incrementPendingMutationAttempts.mockResolvedValue(MAX_REPLAY_ATTEMPTS);

    await drainQueue();

    expect(deletePendingMutation).toHaveBeenCalledWith(1);
    expect(toastApiError).toHaveBeenCalledTimes(1);
  });

  it("treats a network TypeError as still offline: stops the sweep without touching the queue", async () => {
    getPendingMutations.mockResolvedValue([pending(), pending({ id: 2 })]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));

    await drainQueue();

    expect(deletePendingMutation).not.toHaveBeenCalled();
    expect(toastApiError).not.toHaveBeenCalled();
  });

  it("does not treat a non-network exception as still offline: drops that mutation and moves on", async () => {
    getPendingMutations.mockResolvedValue([pending(), pending({ id: 2 })]);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom")));

    await drainQueue();

    expect(deletePendingMutation).toHaveBeenCalledWith(1);
    expect(deletePendingMutation).toHaveBeenCalledWith(2);
    expect(toastApiError).toHaveBeenCalledTimes(2);
  });
});
