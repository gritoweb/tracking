import { api } from "@/lib/api-client";
import { useUIStore } from "@/stores/uiStore";

/** A fetcher of the client's entries in a local-day period, with the Reports rounding the documents have always used. */
export function useClientEntriesFetcher() {
  const roundMode = useUIStore((s) => s.roundMode);
  const roundMinutes = useUIStore((s) => s.roundMinutes);
  const rounded = roundMode !== "off" && roundMinutes > 0;
  return {
    roundingKey: rounded ? `${roundMode}:${roundMinutes}` : "off",
    fetch: (clientId: string, from: string, to: string) =>
      api.reports.detailed({
        since: new Date(`${from}T00:00:00`).toISOString(),
        until: new Date(`${to}T23:59:59.999`).toISOString(),
        clientIds: clientId,
        roundMode: rounded ? roundMode : undefined,
        roundMinutes: rounded ? String(roundMinutes) : undefined,
      }),
  };
}
