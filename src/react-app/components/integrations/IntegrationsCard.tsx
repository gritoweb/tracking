import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Plug } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { TileButton } from "@/components/ui/tile-button";
import { SettingsCardHeader } from "@/components/settings/SettingsCardHeader";
import { GoogleMark } from "@/components/brand/GoogleMark";
import { DynamicsMark, OutlookMark, SlackMark, WorkfrontMark } from "@/components/brand/IntegrationMarks";
import { SlackSection } from "./SlackSection";
import { ConnectionsPanel } from "./ConnectionsPanel";
import { CalendarPanel } from "./CalendarPanel";
import { useIntegrations } from "@/hooks/useIntegrations";
import { useSlackStatus } from "@/hooks/useSlack";
import { useCalendarStatus } from "@/hooks/useCalendarSync";

type TileId = "slack" | "workfront" | "dynamics" | "google" | "microsoft";

interface Tile {
  id: TileId;
  name: string;
  summary: string;
  mark: ReactNode;
  status: string | null;
  panel: ReactNode;
}

const OAUTH_TOASTS: Record<string, Record<string, () => void>> = {
  slack: {
    connected: () => toast.success("Slack connected"),
    not_configured: () => toast.error("Slack isn't configured on this server"),
    forbidden: () => toast.error("Only workspace owners and admins can connect Slack"),
    error: () => toast.error("Couldn't connect Slack"),
  },
  calendar: {
    connected: () => toast.success("Calendar connected"),
    not_configured: () => toast.error("That calendar isn't configured on this server"),
    error: () => toast.error("Couldn't connect that calendar"),
  },
};

/** Every partner the workspace can connect, as one grid; the chosen one's settings open below it, never in a modal. */
export function IntegrationsCard() {
  const [params, setParams] = useSearchParams();
  const { data: integrations = [] } = useIntegrations();
  const { data: slack } = useSlackStatus();
  const { data: calendars = [] } = useCalendarStatus();
  // Back from Slack's consent screen: open its tile so the result sits next to the settings it changed.
  const [selected, setSelected] = useState<TileId | null>(() => (params.has("slack") ? "slack" : null));

  // An OAuth round trip comes back here as ?slack=… or ?calendar=…: say how it went, then drop the parameter.
  useEffect(() => {
    for (const key of ["slack", "calendar"] as const) {
      const result = params.get(key);
      if (!result) continue;
      OAUTH_TOASTS[key][result]?.();
      params.delete(key);
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const byType = (type: "workfront" | "dynamics") => integrations.filter((i) => i.type === type);
  const connectionCount = (n: number) => (n === 0 ? null : n === 1 ? "1 connection" : `${n} connections`);

  const tiles: Tile[] = [
    // A server without a Slack app or a calendar provider has nothing to offer for it: no tile.
    ...(slack?.configured
      ? [
          {
            id: "slack" as const,
            name: "Slack",
            summary: "Unread notifications as a direct message",
            mark: <SlackMark />,
            status: slack.connected ? "Connected" : null,
            panel: <SlackSection />,
          },
        ]
      : []),
    {
      id: "workfront",
      name: "Adobe Workfront",
      summary: "Push tracked time to Workfront",
      mark: <WorkfrontMark />,
      status: connectionCount(byType("workfront").length),
      panel: <ConnectionsPanel type="workfront" connections={byType("workfront")} />,
    },
    {
      id: "dynamics",
      name: "Dynamics 365",
      summary: "Push tracked time to Dynamics",
      mark: <DynamicsMark />,
      status: connectionCount(byType("dynamics").length),
      panel: <ConnectionsPanel type="dynamics" connections={byType("dynamics")} />,
    },
    ...calendars
      .filter((p) => p.configured)
      .map((p) => ({
        id: p.provider,
        name: p.label,
        summary: "Your events on the Calendar, ready to track",
        mark: p.provider === "google" ? <GoogleMark className="h-6 w-6" /> : <OutlookMark />,
        status: p.connected ? "Connected" : null,
        panel: <CalendarPanel provider={p} />,
      })),
  ];

  const open = tiles.find((t) => t.id === selected);

  return (
    <Card>
      <SettingsCardHeader icon={Plug} title="Integrations" />
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiles.map((tile) => (
            <TileButton
              key={tile.id}
              selected={tile.id === selected}
              onClick={() => setSelected((current) => (current === tile.id ? null : tile.id))}
            >
              <div className="flex w-full items-center gap-3">
                {tile.mark}
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{tile.name}</span>
              </div>
              <span className="text-xs text-muted-foreground">{tile.summary}</span>
              {tile.status && (
                <Badge variant="secondary" className="text-micro">
                  {tile.status}
                </Badge>
              )}
            </TileButton>
          ))}
        </div>

        {open && (
          <>
            <Separator />
            {/* Keyed so switching partners resets the panel's own state (an open form, a confirmation). */}
            <div key={open.id}>{open.panel}</div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
