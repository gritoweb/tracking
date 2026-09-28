import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { SettingsHint } from "@/components/settings/SettingsHint";
import { useDisconnectCalendar, useSetAutoTrack } from "@/hooks/useCalendarSync";
import type { CalendarProviderStatus } from "@/lib/api-client";

/** One calendar provider — personal, so every member connects their own; a work and a personal calendar can both be on. */
export function CalendarPanel({ provider }: { provider: CalendarProviderStatus }) {
  const disconnect = useDisconnectCalendar();
  const setAutoTrack = useSetAutoTrack();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{provider.label}</span>
          {provider.connected && provider.accountEmail && (
            <span className="text-xs text-muted-foreground">{provider.accountEmail}</span>
          )}
          <Badge variant="outline" className="text-micro">
            Just you
          </Badge>
        </div>
        {provider.connected ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setConfirmDisconnect(true)}
            disabled={disconnect.isPending}
          >
            {disconnect.isPending ? <Spinner size="sm" /> : "Disconnect"}
          </Button>
        ) : (
          // Full-page navigation — the worker redirects to the provider's consent screen.
          <Button
            variant="outline"
            size="sm"
            onClick={() => (window.location.href = `/api/calendar/${provider.provider}/connect`)}
          >
            Connect
          </Button>
        )}
      </div>

      <SettingsHint>
        Your events show up on the Calendar as dashed blocks — click one to track it. Read-only: we never change your
        calendar.
      </SettingsHint>

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
            disabled={setAutoTrack.isPending}
            onCheckedChange={(enabled) => setAutoTrack.mutate({ provider: provider.provider, enabled })}
          />
        </SettingsRow>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Disconnect calendar?"
        description={`Ghost blocks and auto-track for ${provider.label} will stop. Time already tracked is unaffected.`}
        confirmLabel="Disconnect"
        onConfirm={() => {
          disconnect.mutate(provider.provider);
          setConfirmDisconnect(false);
        }}
      />
    </div>
  );
}
