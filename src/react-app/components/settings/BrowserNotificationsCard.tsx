import { useState } from "react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { SettingsCardHeader } from "./SettingsCardHeader";
import { SettingsHint } from "./SettingsHint";
import { api } from "@/lib/api-client";
import { toastApiError } from "@/lib/toastApiError";
import {
  browserNotificationState,
  disableBrowserNotifications,
  enableBrowserNotifications,
  type BrowserNotificationState,
} from "@/lib/browserNotifications";

/** Turns the bell into desktop notifications for this browser — once per browser, like any site's "allow notifications". */
export function BrowserNotificationsCard() {
  const [state, setState] = useState<BrowserNotificationState>(browserNotificationState);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toastApiError(error, "Couldn't change notifications in this browser");
    } finally {
      setBusy(false);
      setState(browserNotificationState());
    }
  };

  const enable = () =>
    run(async () => {
      const next = await enableBrowserNotifications();
      if (next === "on") toast.success("Notifications are on in this browser");
    });

  return (
    <Card>
      <SettingsCardHeader
        icon={BellRing}
        title="Desktop notifications"
        action={
          state === "on" && (
            <Badge variant="secondary" className="text-micro">
              On in this browser
            </Badge>
          )
        }
      />
      <CardContent className="space-y-3">
        <p className="text-sm leading-normal text-muted-foreground">
          When a task is assigned to you, someone mentions you or your task moves, a notification appears in the corner
          of your screen with your computer's sound — even when TimeTracker isn't open, as long as the browser is.
          Clicking it opens the task.
        </p>

        {state === "unsupported" && (
          <SettingsHint>
            This browser can't show notifications. On iPhone or iPad, add TimeTracker to your Home Screen first (Share →
            Add to Home Screen) and turn this on from there.
          </SettingsHint>
        )}
        {state === "blocked" && (
          <SettingsHint>
            Notifications are blocked for this site. Allow them in your browser's site settings (the icon left of the
            address), then come back here.
          </SettingsHint>
        )}
        {state === "off" && (
          <div className="space-y-2">
            <Button size="sm" onClick={enable} disabled={busy}>
              {busy ? <Spinner size="sm" /> : "Enable notifications"}
            </Button>
            <SettingsHint>Each browser or computer turns this on once.</SettingsHint>
          </div>
        )}
        {state === "on" && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api.push.sendTest();
                  toast.success("Test sent — switch to another tab or app to see it");
                })
              }
            >
              Send a test
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(disableBrowserNotifications)}>
              Turn off
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
