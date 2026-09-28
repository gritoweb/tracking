import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { SettingsHint } from "@/components/settings/SettingsHint";
import {
  useDisconnectSlack,
  useSendSlackTest,
  useSetSlackNotify,
  useSlackStatus,
} from "@/hooks/useSlack";

/** Slack as a delivery channel for unread notifications: the workspace's installation plus each person's opt-out. */
export function SlackSection() {
  const { data: status } = useSlackStatus();
  const setNotify = useSetSlackNotify();
  const sendTest = useSendSlackTest();
  const disconnect = useDisconnectSlack();
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // Same rule as calendar sync: a server without a Slack app has nothing to offer here.
  if (!status?.configured) return null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Slack</span>
          {status.connected && (
            <Badge variant="secondary" className="text-micro">
              Connected
            </Badge>
          )}
          {status.teamName && <span className="text-xs text-muted-foreground">{status.teamName}</span>}
        </div>
        {status.canManage &&
          (status.connected ? (
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
            // Full-page navigation — the worker redirects to Slack's consent screen.
            <Button variant="outline" size="sm" onClick={() => (window.location.href = "/api/slack/connect")}>
              Add to Slack
            </Button>
          ))}
      </div>

      {!status.connected && (
        <SettingsHint>
          {status.canManage
            ? "Connect your Slack workspace so unread notifications reach people as a direct message."
            : "A workspace owner or admin can connect Slack so unread notifications reach you as a direct message."}
        </SettingsHint>
      )}

      {status.connected && (
        <div className="space-y-3 rounded-md border p-3">
          <SettingsRow
            htmlFor="slack-notify"
            label="Send my unread notifications to Slack"
            description="When a task is assigned to you or someone mentions you, and you haven't opened it within 5 minutes, the TimeTracker bot sends you a direct message."
          >
            <Switch
              id="slack-notify"
              checked={status.notify}
              disabled={setNotify.isPending}
              onCheckedChange={(checked) => setNotify.mutate(checked)}
            />
          </SettingsRow>
          {status.linked === false && (
            <SettingsHint>
              No Slack user in {status.teamName ?? "this Slack workspace"} has your email address, so nothing can reach you
              there yet.
            </SettingsHint>
          )}
          <Button variant="outline" size="sm" onClick={() => sendTest.mutate()} disabled={sendTest.isPending}>
            {sendTest.isPending ? <Spinner size="sm" /> : "Send me a test message"}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Disconnect Slack?"
        description="Nobody in this workspace will get unread notifications on Slack until it's connected again."
        confirmLabel="Disconnect"
        onConfirm={() => {
          disconnect.mutate();
          setConfirmDisconnect(false);
        }}
      />
    </div>
  );
}
