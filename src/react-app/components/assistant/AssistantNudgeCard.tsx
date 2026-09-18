import {
  CalendarClock,
  Clock,
  Play,
  Hourglass,
  Coffee,
  TrendingUp,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAssistantStore } from "@/stores/assistantStore";
import { useTrackNudgeEvent } from "@/hooks/useAssistant";
import { useTimer } from "@/hooks/useTimer";
import type { AssistantNudge } from "@shared/schemas";

const NUDGE_ICONS: Record<AssistantNudge["kind"], typeof CalendarClock> = {
  untracked_meeting: CalendarClock,
  meeting_now: Play,
  meeting_soon: Clock,
  long_timer: Hourglass,
  nothing_tracked: Coffee,
  budget_risk: TrendingUp,
};

export function AssistantNudgeCard({ nudge }: { nudge: AssistantNudge }) {
  const dismissNudge = useAssistantStore((s) => s.dismissNudge);
  const trackNudgeEvent = useTrackNudgeEvent();
  const { startTimer, stopTimer } = useTimer();
  const Icon = NUDGE_ICONS[nudge.kind];

  const trackEvent = () => {
    if (!nudge.event) return;
    trackNudgeEvent.mutate(
      {
        calendarEventId: nudge.event.calendarEventId,
        title: nudge.event.title,
        start: nudge.event.start,
        stop: nudge.event.stop,
      },
      { onSuccess: () => dismissNudge(nudge.id) }
    );
  };

  const startFromEvent = () => {
    startTimer({ description: nudge.event?.title ?? "" });
    dismissNudge(nudge.id);
  };

  // "Your timer has been running for 18h — still on it?" used to offer nothing
  // but a chat window. The nudge names the problem, so it should carry the fix:
  // stopping is the whole answer, and the entry survives it (unlike Discard),
  // so it needs no confirmation — same grammar as the timer bar's own Stop.
  const stopFromNudge = () => {
    stopTimer();
    dismissNudge(nudge.id);
  };

  return (
    <div className="flex items-start gap-2.5 rounded-container bg-card p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{nudge.title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{nudge.body}</p>
        {(nudge.kind === "untracked_meeting" ||
          nudge.kind === "meeting_now" ||
          nudge.kind === "long_timer") && (
          <div className="mt-2">
            {nudge.kind === "untracked_meeting" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={trackEvent}
                disabled={trackNudgeEvent.isPending}
              >
                {trackNudgeEvent.isPending ? "Adding…" : "Add to timesheet"}
              </Button>
            ) : nudge.kind === "long_timer" ? (
              <Button variant="outline" size="sm" onClick={stopFromNudge}>
                Stop timer
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={startFromEvent}>
                Start timer
              </Button>
            )}
          </div>
        )}
      </div>
      <Button
        variant="ghost"
        size="icon-xs"
        className="shrink-0 text-muted-foreground"
        onClick={() => dismissNudge(nudge.id)}
        aria-label="Dismiss nudge"
        title="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
