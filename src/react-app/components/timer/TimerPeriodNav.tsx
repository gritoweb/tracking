import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ListRangePicker } from "./ListRangePicker";
import { VIEW_LABELS } from "./calendarViewLabels";
import type { CalendarViewType } from "@/components/calendar/CalendarView";
import type { ListRangeKey } from "@/lib/dateUtils";

interface TimerPeriodNavProps {
  isListView: boolean;
  listRangeKey: ListRangeKey;
  listRangeSince: string | null;
  listRangeUntil: string | null;
  onListRangeChange: (key: ListRangeKey, since?: string | null, until?: string | null) => void;
  onPrev: () => void;
  onNext: () => void;
  periodNoun: "day" | "week" | "month";
  onToday: () => void;
  periodIncludesToday: boolean;
  label: string;
  densityReduced: boolean;
  calendarView: CalendarViewType;
  requestedCalendarView: CalendarViewType;
}

/** The header's left side: period stepper or list-range picker, the Today button and the period label. Pure view. */
export function TimerPeriodNav({
  isListView,
  listRangeKey,
  listRangeSince,
  listRangeUntil,
  onListRangeChange,
  onPrev,
  onNext,
  periodNoun,
  onToday,
  periodIncludesToday,
  label,
  densityReduced,
  calendarView,
  requestedCalendarView,
}: TimerPeriodNavProps) {
  return (
    <div className="flex items-center gap-2">
      {isListView ? (
        <ListRangePicker
          value={listRangeKey}
          customSince={listRangeSince}
          customUntil={listRangeUntil}
          onChange={onListRangeChange}
        />
      ) : (
        <div className="flex items-center" data-slot="period-nav">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onPrev} aria-label={`Previous ${periodNoun}`}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Previous {periodNoun}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={onNext} aria-label={`Next ${periodNoun}`}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Next {periodNoun}</TooltipContent>
          </Tooltip>
        </div>
      )}
      {/* One "back to now" control for every view, including the list —
          which previously had none, so leaving Split stranded it on
          "Custom range · Monday, Aug 17" with the dropdown as the only way
          home. "Today" has always meant "the period containing today"
          (it returns a week view to this week), so pointing the list at
          This week is the same promise, not a new one.

          Deliberately visible-but-disabled when the period already contains
          today, never hidden. An earlier pass made it `invisible` +
          `aria-hidden` to avoid the label reading "Today Today" beside the
          h1 — which traded an affordance for a cosmetic nit, and fired at
          exactly the wrong moment: switching to Split collapses the period
          to a single day, so the one period control vanished from both the
          screen and the a11y tree just as a user would reach for it. */}
      <Button
        variant="outline"
        size="sm"
        className="h-8"
        onClick={isListView ? () => onListRangeChange("thisWeek") : onToday}
        disabled={periodIncludesToday}
      >
        Today
      </Button>
      <h1 className="ml-1 text-sm font-semibold tracking-tight tabular-nums">{label}</h1>
      {/* Names the effect, not the cause. "narrow pane" described the
          app's own layout state — a fact about the container, offered to a
          user who asked for a week and got five days. The full sentence
          already lives in the View options popover; this is its short form
          in the same vocabulary. */}
      {densityReduced && (
        <span
          className="rounded-full bg-muted px-2 py-0.5 text-micro font-medium text-muted-foreground"
          title={`The pane is too narrow for ${VIEW_LABELS[requestedCalendarView]}.`}
        >
          Showing {VIEW_LABELS[calendarView]}
        </span>
      )}
    </div>
  );
}
