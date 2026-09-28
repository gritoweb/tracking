import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { syncBrowserNotifications } from "@/lib/browserNotifications";

/** App-wide half of desktop notifications: keeps this browser subscribed and opens the task a click asked for. */
export function useBrowserNotifications() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    syncBrowserNotifications().catch((error: unknown) => console.warn("browser notifications sync failed", error));
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent<{ type?: string; link?: string }>) => {
      if (event.data?.type !== "open-notification" || !event.data.link) return;
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      navigate(event.data.link);
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [navigate, queryClient]);
}
