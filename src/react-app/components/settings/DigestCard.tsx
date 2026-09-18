import { Mail, Send } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { SettingsCardHeader } from "./SettingsCardHeader";
import { SettingsRow } from "./SettingsRow";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useHydrateSettings, useUpdateSettings, useSendDigest } from "@/hooks/useSettings";

/** Whole hours only — nobody wants their briefing at 07:20. */
const HOURS = Array.from({ length: 24 }, (_, h) => h);

function hourLabel(hour: number, timeFormat: "24h" | "12h"): string {
  if (timeFormat === "24h") return `${String(hour).padStart(2, "0")}:00`;
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:00 ${suffix}`;
}

/**
 * Email digests: a morning briefing on yesterday and a Monday summary of the
 * week just gone.
 *
 * Both default to off, and both can be sent on demand — a scheduled email you
 * have never read is impossible to have an opinion about, so the decision to
 * keep it should follow seeing one, not precede it.
 */
export function DigestCard() {
  const { data: settings } = useHydrateSettings();
  const updateSettings = useUpdateSettings();
  const sendDigest = useSendDigest();

  const daily = settings?.digestDaily ?? false;
  const weekly = settings?.digestWeekly ?? false;
  const hour = settings?.digestHour ?? 8;
  const timeFormat = settings?.timeFormat ?? "24h";
  const anyOn = daily || weekly;

  // Turning a digest on is also when the server learns which timezone "8am"
  // means — it has no request to read one from at cron time.
  const patch = (body: Record<string, unknown>) =>
    updateSettings.mutate({
      ...body,
      digestTimezoneOffsetMinutes: new Date().getTimezoneOffset(),
    });

  return (
    <Card>
      <SettingsCardHeader icon={Mail} title="Email digests" />
      <CardContent className="space-y-5">
        <SettingsRow
          htmlFor="digest-daily"
          label="Morning briefing"
          description="Yesterday's hours by project, budgets worth a look, and anything waiting for review"
        >
          <Switch
            id="digest-daily"
            checked={daily}
            onCheckedChange={(checked) => patch({ digestDaily: checked })}
          />
        </SettingsRow>

        <Separator />

        <SettingsRow
          htmlFor="digest-weekly"
          label="Weekly summary"
          description="The same, for the week just gone — sent on Monday"
        >
          <Switch
            id="digest-weekly"
            checked={weekly}
            onCheckedChange={(checked) => patch({ digestWeekly: checked })}
          />
        </SettingsRow>

        <Separator />

        <SettingsRow label="Send at" description="Your local time">
          <Select
            value={String(hour)}
            onValueChange={(v) => patch({ digestHour: Number(v) })}
            disabled={!anyOn}
          >
            <SelectTrigger className="w-32 text-sm" aria-label="Digest send time">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOURS.map((h) => (
                <SelectItem key={h} value={String(h)}>
                  {hourLabel(h, timeFormat)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsRow>

        <Separator />

        <SettingsRow label="Preview" description="Sends one to your own address right now, covering yesterday">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => sendDigest.mutate("daily")}
            disabled={sendDigest.isPending}
          >
            {sendDigest.isPending ? <Spinner size="sm" /> : <Send className="h-3.5 w-3.5" />}
            Send one now
          </Button>
        </SettingsRow>
      </CardContent>
    </Card>
  );
}
