import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const PING_INTERVAL_MS = 30_000;

/**
 * A user's own live inbox — a separate socket to the NotificationRoom DO (one per user), not
 * the workspace's TimerRoom. The bell's own 60s poll (`useNotifications`) is the real backstop;
 * this only makes a new notification feel instant while connected.
 */
export function useNotificationSocket() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let destroyed = false;
    let ws: WebSocket | null = null;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;

    function connect() {
      if (destroyed) return;
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      ws = new WebSocket(`${protocol}//${window.location.host}/api/notifications/ws`);

      ws.onopen = () => {
        retryCount = 0;
        pingTimer = setInterval(() => {
          if (ws?.readyState === WebSocket.OPEN) ws.send("ping");
        }, PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as { event?: string };
          if (msg.event === "notification:new") {
            queryClient.invalidateQueries({ queryKey: ["notifications"] });
          }
        } catch {
          // Ignore malformed messages.
        }
      };

      ws.onclose = () => {
        if (pingTimer) {
          clearInterval(pingTimer);
          pingTimer = null;
        }
        if (destroyed) return;
        const delay = Math.min(1000 * 2 ** retryCount, 30_000);
        retryCount++;
        retryTimer = setTimeout(connect, delay);
      };

      ws.onerror = () => ws?.close();
    }

    connect();

    return () => {
      destroyed = true;
      if (pingTimer) clearInterval(pingTimer);
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, [queryClient]);
}
