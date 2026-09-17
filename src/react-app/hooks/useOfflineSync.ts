import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getPendingMutations,
  deletePendingMutation,
  incrementPendingMutationAttempts,
} from "@/lib/idb";
import { ApiError, errorMessage } from "@/lib/api-client";
import { toastApiError } from "@/lib/toastApiError";

// Bounded so a persistently failing server doesn't retry a write forever.
export const MAX_REPLAY_ATTEMPTS = 5;

export function useOfflineSync() {
  const queryClient = useQueryClient();
  const isOnline = useOnlineStatus();
  const isDraining = useRef(false);

  useEffect(() => {
    if (!isOnline || isDraining.current) return;
    isDraining.current = true;

    drainQueue()
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      })
      .finally(() => {
        isDraining.current = false;
      });
  }, [isOnline, queryClient]);

  return { isOnline };
}

/** Exported for direct unit testing of the queue's per-status rules, separate from the online/offline effect wiring. */
export async function drainQueue() {
  const mutations = await getPendingMutations();
  for (const mutation of mutations) {
    let res: Response;
    try {
      res = await fetch(mutation.url, {
        method: mutation.method,
        body: mutation.body ? JSON.stringify(mutation.body) : undefined,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      // Only a network TypeError means "still offline" — anything else is this mutation's own problem.
      if (err instanceof TypeError) break;
      if (mutation.id !== undefined) await deletePendingMutation(mutation.id);
      toastApiError(err, "Couldn't sync a change made while offline");
      continue;
    }

    if (res.ok) {
      if (mutation.id !== undefined) await deletePendingMutation(mutation.id);
      continue;
    }

    if (res.status >= 400 && res.status < 500) {
      // The server refused the same body once; replaying it again can't change that.
      const raw = await res.text().catch(() => "");
      if (mutation.id !== undefined) await deletePendingMutation(mutation.id);
      toastApiError(
        new ApiError(errorMessage(raw, res.statusText), res.status),
        "Couldn't sync a change made while offline"
      );
      continue;
    }

    // 5xx: worth another try, but not forever.
    if (mutation.id === undefined) continue;
    const attempts = await incrementPendingMutationAttempts(mutation.id);
    if (attempts >= MAX_REPLAY_ATTEMPTS) {
      await deletePendingMutation(mutation.id);
      toastApiError(
        new Error(`Sync retry limit reached (HTTP ${res.status})`),
        "Gave up syncing a change made while offline"
      );
    }
  }
}

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Only the data that can drift while offline — a keyless invalidate here
      // refetched every cached query on each network flap.
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["assistant-nudges"] });
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [queryClient]);

  return isOnline;
}
