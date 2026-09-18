import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SettingsCardHeader } from "./SettingsCardHeader";
import { SettingsRow } from "./SettingsRow";
import {
  useCalendarStatus,
  useDisconnectCalendar,
  useSetAutoTrack,
} from "@/hooks/useCalendarSync";
import type { CalendarProviderStatus } from "@/lib/api-client";

/**
 * Calendar sync, one section per provider the server supports.
 *
 * Deliberately not a card per provider: they're the same feature with the same
 * explanation, and stacking two near-identical cards in Settings would read as
 * two unrelated integrations rather than one choice of calendar. A workspace can
 * connect both at once — a work calendar and a personal one is ordinary.
 */
export function CalendarSyncCard() {
  const [params, setParams] = useSearchParams();
  const { data: providers = [], isLoading } = useCalendarStatus();
  const disconnect = useDisconnectCalendar();
  const setAutoTrack = useSetAutoTrack();
  const [disconnectTarget, setDisconnectTarget] = useState<CalendarProviderStatus | null>(null);

  // Surface the OAuth round-trip result (redirected back to /settings?calendar=…).
  useEffect(() => {
    const result = params.get("calendar");
    if (!result) return;
    if (result === "connected") toast.success("Calendar connected");
    else if (result === "not_configured")
      toast.error("That calendar isn't configured on this server");
    else if (result === "error") toast.error("Couldn't connect that calendar");
    params.delete("calendar");
    setParams(params, { replace: true });
  }, [params, setParams]);

  const anyConfigured = providers.some((p) => p.configured);

  return (
    <Card>
      <SettingsCardHeader icon={CalendarDays} title="Calendar sync" />
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-4 w-64" />
        ) : !anyConfigured ? (
          <p className="text-sm leading-normal text-muted-foreground">
            Calendar sync isn&apos;t configured on this server yet.
          </p>
        ) : (
          <div className="space-y-5">
            <p className="text-sm leading-normal text-muted-foreground">
              Your events show up on the <span className="font-medium">Calendar</span> as
              dashed blocks — click one to track it. Read-only: we never change your
              calendar. Connect more than one if your work and personal calendars are
              separate.
            </p>
            {providers
              .filter((p) => p.configured)
              .map((provider, i) => (
                <div key={provider.provider} className="space-y-4">
                  {i > 0 && <Separator />}
                  <ProviderRow
                    provider={provider}
                    onDisconnect={() => setDisconnectTarget(provider)}
                    disconnecting={
                      disconnect.isPending && disconnect.variables === provider.provider
                    }
                    onAutoTrack={(enabled) =>
                      setAutoTrack.mutate({ provider: provider.provider, enabled })
                    }
                    autoTrackPending={setAutoTrack.isPending}
                  />
                </div>
              ))}
          </div>
        )}
      </CardContent>

      <ConfirmDialog
        open={!!disconnectTarget}
        onOpenChange={(o) => !o && setDisconnectTarget(null)}
        title="Disconnect calendar?"
        description={`Ghost blocks and auto-track for ${disconnectTarget?.label ?? "this calendar"} will stop. Time already tracked is unaffected.`}
        confirmLabel="Disconnect"
        onConfirm={() => {
          if (disconnectTarget) disconnect.mutate(disconnectTarget.provider);
          setDisconnectTarget(null);
        }}
      />
    </Card>
  );
}

function ProviderRow({
  provider,
  onDisconnect,
  disconnecting,
  onAutoTrack,
  autoTrackPending,
}: {
  provider: CalendarProviderStatus;
  onDisconnect: () => void;
  disconnecting: boolean;
  onAutoTrack: (enabled: boolean) => void;
  autoTrackPending: boolean;
}) {
  // Full-page navigation — the worker redirects to the provider's consent screen.
  const connect = () => {
    window.location.href = `/api/calendar/${provider.provider}/connect`;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{provider.label}</span>
          {provider.connected && (
            <Badge variant="secondary" className="text-micro">
              Connected
            </Badge>
          )}
          {provider.connected && provider.accountEmail && (
            <span className="text-xs text-muted-foreground">{provider.accountEmail}</span>
          )}
        </div>
        {provider.connected ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={onDisconnect}
            disabled={disconnecting}
          >
            {disconnecting ? <Spinner size="sm" /> : "Disconnect"}
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={connect}>
            Connect
          </Button>
        )}
      </div>

      {provider.connected && (
        <SettingsRow
          className="rounded-md border p-3"
          htmlFor={`auto-track-${provider.provider}`}
          label="Auto-track calendar events"
          description="Automatically create a time entry when an event on this calendar ends."
        >
          <Switch
            id={`auto-track-${provider.provider}`}
            checked={provider.autoTrack}
            disabled={autoTrackPending}
            onCheckedChange={onAutoTrack}
          />
        </SettingsRow>
      )}
    </div>
  );
}
