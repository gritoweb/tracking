import { openDB, type IDBPDatabase } from "idb";
import { authClient } from "@/lib/auth-client";

interface TimerState {
  entryId: string;
  startedAt: number; // Unix ms
  description: string;
  projectId: string | null;
  projectColor: string | null;
}

interface PendingMutation {
  id?: number;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  body?: unknown;
  createdAt: number;
  attempts: number;
  /** Owner of the write; absent on rows queued before per-person isolation existed. */
  userId?: string;
}

interface TimeTrackerDB {
  timer_state: {
    key: "current";
    value: TimerState;
  };
  pending_mutations: {
    key: number;
    value: PendingMutation;
    indexes: { by_created: number };
  };
}

let _db: IDBPDatabase<TimeTrackerDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<TimeTrackerDB>> {
  if (_db) return _db;
  _db = await openDB<TimeTrackerDB>("time-tracker", 1, {
    upgrade(db) {
      db.createObjectStore("timer_state");
      const mutations = db.createObjectStore("pending_mutations", {
        keyPath: "id",
        autoIncrement: true,
      });
      mutations.createIndex("by_created", "createdAt");
    },
  });
  return _db;
}

export async function saveTimerState(state: TimerState): Promise<void> {
  const db = await getDB();
  await db.put("timer_state", state, "current");
}

export async function loadTimerState(): Promise<TimerState | undefined> {
  const db = await getDB();
  return db.get("timer_state", "current");
}

export async function clearTimerState(): Promise<void> {
  const db = await getDB();
  await db.delete("timer_state", "current");
}

// Survives a transient empty session (a failed refetch while offline) so a queued edit keeps its owner.
let lastKnownUserId: string | null = null;
authClient.$store.atoms.session.subscribe((session) => {
  const id = session.data?.user?.id;
  if (id) lastKnownUserId = id;
});

/** Returns false, queueing nothing, when no person can own the write; the caller must surface its original error. */
export async function addPendingMutation(
  mutation: Omit<PendingMutation, "id" | "createdAt" | "attempts" | "userId">
): Promise<boolean> {
  const userId = authClient.$store.atoms.session.get().data?.user?.id ?? lastKnownUserId;
  if (!userId) return false;
  const db = await getDB();
  await db.add("pending_mutations", {
    ...mutation,
    userId,
    createdAt: Date.now(),
    attempts: 0,
  } as PendingMutation);
  return true;
}

export async function getPendingMutations(): Promise<PendingMutation[]> {
  const db = await getDB();
  return db.getAllFromIndex("pending_mutations", "by_created");
}

export async function deletePendingMutation(id: number): Promise<void> {
  const db = await getDB();
  await db.delete("pending_mutations", id);
}

export async function clearPendingMutations(): Promise<void> {
  lastKnownUserId = null;
  const db = await getDB();
  await db.clear("pending_mutations");
}

/** Bumps a replay's failure count and returns the new total; a missing row (raced delete) counts as exhausted. */
export async function incrementPendingMutationAttempts(id: number): Promise<number> {
  const db = await getDB();
  const mutation = await db.get("pending_mutations", id);
  if (!mutation) return Number.MAX_SAFE_INTEGER;
  const attempts = (mutation.attempts ?? 0) + 1;
  await db.put("pending_mutations", { ...mutation, attempts });
  return attempts;
}

export type { TimerState, PendingMutation };
