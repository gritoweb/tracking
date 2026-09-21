// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown> & { id?: number };
let rows: Row[] = [];
let nextId = 1;
let sessionUserId: string | null = null;
type SessionListener = (value: { data: { user: { id: string } } | null }) => void;
let sessionListeners: SessionListener[] = [];
const signOut = vi.fn(async () => ({ data: { success: true }, error: null }));

// idb's openDB needs a real IndexedDB; this fake covers only the calls lib/idb.ts makes.
vi.mock("idb", () => ({
  openDB: async () => ({
    add: async (_store: string, value: Row) => {
      rows.push({ ...value, id: nextId++ });
    },
    getAllFromIndex: async () => [...rows].sort((a, b) => Number(a.createdAt) - Number(b.createdAt)),
    get: async (_store: string, id: number) => rows.find((r) => r.id === id),
    put: async (_store: string, value: Row) => {
      rows = rows.map((r) => (r.id === value.id ? value : r));
    },
    delete: async (_store: string, id: number) => {
      rows = rows.filter((r) => r.id !== id);
    },
    clear: async () => {
      rows = [];
    },
  }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signOut: () => signOut(),
    useSession: () => ({
      data: sessionUserId ? { user: { id: sessionUserId }, session: {} } : null,
      isPending: false,
    }),
    $store: {
      atoms: {
        session: {
          get: () => ({ data: sessionUserId ? { user: { id: sessionUserId } } : null }),
          subscribe: (listener: SessionListener) => {
            sessionListeners.push(listener);
            listener({ data: sessionUserId ? { user: { id: sessionUserId } } : null });
          },
        },
      },
    },
  },
}));

vi.mock("@/lib/toastApiError", () => ({ toastApiError: vi.fn() }));

const fetchMock = vi.fn();

function setSession(userId: string | null) {
  sessionUserId = userId;
  for (const listener of sessionListeners) {
    listener({ data: userId ? { user: { id: userId } } : null });
  }
}

beforeEach(() => {
  vi.resetModules();
  rows = [];
  nextId = 1;
  sessionUserId = null;
  sessionListeners = [];
  vi.stubGlobal("fetch", fetchMock.mockResolvedValue({ ok: true, status: 200 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

async function enqueueAs(userId: string, url = "/api/time-entries/e1") {
  setSession(userId);
  const { addPendingMutation } = await import("./idb");
  await addPendingMutation({ method: "PUT", url, body: { description: "edited offline" } });
}

describe("offline queue isolation between people", () => {
  it("does not replay person A's mutation under person B's session", async () => {
    await enqueueAs("user-a");
    const { drainQueue } = await import("@/hooks/useOfflineSync");

    sessionUserId = "user-b";
    await drainQueue("user-b");

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still replays a mutation queued by the same person, then empties the queue", async () => {
    await enqueueAs("user-b");
    const { drainQueue } = await import("@/hooks/useOfflineSync");

    await drainQueue("user-b");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(0);
  });

  it("replays only the caller's mutations when both people have pending ones", async () => {
    await enqueueAs("user-a", "/api/time-entries/from-a");
    await enqueueAs("user-b", "/api/time-entries/from-b");
    const { drainQueue } = await import("@/hooks/useOfflineSync");

    await drainQueue("user-b");

    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/api/time-entries/from-b"]);
    expect(rows.map((r) => r.userId)).toEqual(["user-a"]);
  });

  it("discards a legacy mutation with no owner instead of replaying it", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    rows.push({ id: 99, method: "PUT", url: "/api/time-entries/old", createdAt: 1, attempts: 0 });
    nextId = 100;
    const { drainQueue } = await import("@/hooks/useOfflineSync");

    await drainQueue("user-a");

    expect(fetchMock).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
  });

  it("never replays anything without a signed-in user", async () => {
    await enqueueAs("user-a");
    const { drainQueue } = await import("@/hooks/useOfflineSync");

    await drainQueue(undefined);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("queues under the last known person when the session store is momentarily empty", async () => {
    const { addPendingMutation } = await import("./idb");
    setSession("user-a");
    setSession(null);

    await expect(
      addPendingMutation({ method: "PUT", url: "/api/time-entries/e1" })
    ).resolves.toBe(true);

    expect(rows.map((r) => r.userId)).toEqual(["user-a"]);
  });

  it("does not queue, and says so, when nobody has ever been signed in", async () => {
    const { addPendingMutation } = await import("./idb");

    await expect(
      addPendingMutation({ method: "PUT", url: "/api/time-entries/e1" })
    ).resolves.toBe(false);

    expect(rows).toHaveLength(0);
  });

  it("follows a change of person instead of keeping the previous owner", async () => {
    const { addPendingMutation } = await import("./idb");
    setSession("user-a");
    setSession("user-b");
    setSession(null);

    await addPendingMutation({ method: "PUT", url: "/api/time-entries/e1" });

    expect(rows.map((r) => r.userId)).toEqual(["user-b"]);
  });

  it("forgets the last known person once the queue is cleared", async () => {
    const { addPendingMutation, clearPendingMutations } = await import("./idb");
    setSession("user-a");
    setSession(null);
    await clearPendingMutations();

    await expect(
      addPendingMutation({ method: "PUT", url: "/api/time-entries/e1" })
    ).resolves.toBe(false);
    expect(rows).toHaveLength(0);
  });

  it("empties the queue on sign-out, even when the sign-out request fails", async () => {
    await enqueueAs("user-a");
    expect(rows).toHaveLength(1);
    signOut.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { useAuth } = await import("@/hooks/useAuth");

    await expect(useAuth().signOut()).rejects.toThrow("Failed to fetch");

    expect(rows).toHaveLength(0);
  });
});
