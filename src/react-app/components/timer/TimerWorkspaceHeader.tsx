import { TimerViewSwitcher } from "./TimerViewSwitcher";
import { DraftDayButton } from "@/components/drafts/DraftDayButton";
import { CalendarViewOptions } from "./CalendarViewOptions";
import { TimerPeriodNav } from "./TimerPeriodNav";
import { TimerAddEntrySplitButton } from "./TimerAddEntrySplitButton";
import { TimerLoggedBar } from "./TimerLoggedBar";
import type { TimerView } from "@/stores/uiStore";
import type { CalendarViewType } from "@/components/calendar/CalendarView";
import {
  formatPeriodLabel,
  formatListRangeLabel,
  summarizePeriod,
  type ListRangeKey,
} from "@/lib/dateUtils";

export interface LoggedSegment {
  projectId: string | null;
  projectName: string | null;
  color: string;
  seconds: number;
}

interface TimerWorkspaceHeaderProps {
  since: Date;
  until: Date;
  totalSeconds: number;
  segments: LoggedSegment[];
  view: TimerView;
  onViewChange: (view: TimerView) => void;
  /** Split needs two columns; below lg the tab is withdrawn entirely. */
  allowSplit: boolean;
  onPrev: () => void;
  onNext: () => void;
  /** What one press of prev/next moves by, for the label and the a11y name. */
  periodNoun: "day" | "week" | "month";
  /** Week start (0=Sun..6=Sat), for naming week-shaped periods. */
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  onToday: () => void;
  onAddEntry: () => void;
  onAiQuickAdd: () => void;
  /** Draft the visible day's missing entries, then open review. */
  onDraftDay: () => void;
  draftPending: boolean;
  /** Drafts already waiting on the visible period — turns the button into "Review N". */
  draftCount: number;
  // Calendar sub-controls — only rendered for calendar/split views.
  calendarView: CalendarViewType;
  /** What the user picked; the pane may be rendering something narrower. */
  requestedCalendarView: CalendarViewType;
  onCalendarViewChange: (v: CalendarViewType) => void;
  slotHeight: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  showWeekends: boolean;
  onToggleWeekends: () => void;
  // List-view date scope — replaces the week nav when the list view is active.
  listRangeKey: ListRangeKey;
  listRangeSince: string | null;
  listRangeUntil: string | null;
  onListRangeChange: (key: ListRangeKey, since?: string | null, until?: string | null) => void;
}

// Shared header for the unified Timer tab: period navigation, the "logged this
// period" bar, the 4-view switcher, and (for calendar/split) the day-count +
// zoom controls.
export function TimerWorkspaceHeader({
  since,
  until,
  totalSeconds,
  segments,
  view,
  onViewChange,
  allowSplit,
  onPrev,
  onNext,
  periodNoun,
  weekStartsOn: wso,
  onToday,
  onAddEntry,
  onAiQuickAdd,
  onDraftDay,
  draftPending,
  draftCount,
  calendarView,
  requestedCalendarView,
  onCalendarViewChange,
  slotHeight,
  onZoomIn,
  onZoomOut,
  showWeekends,
  onToggleWeekends,
  listRangeKey,
  listRangeSince,
  listRangeUntil,
  onListRangeChange,
}: TimerWorkspaceHeaderProps) {
  const showCalendarControls = view === "calendar" || view === "split";
  // A single-day grid has no week number to stamp on its label.
  const isDayView = calendarView === "timeGridDay";
  // The list view scopes by an explicit range instead of stepping week-by-week,
  // so it swaps the prev/next/Today nav for the range picker.
  const isListView = view === "list";

  // Short, spoken-language name for the active period, e.g. "this week",
  // "last week", "Jul 14 – 20", "Jun 2025". Deliberately lowercase: it reads as
  // the tail of the sentence "Logged this week".
  const periodSummary = summarizePeriod(since, until, wso);
  const now = new Date();
  const periodIncludesToday = now >= since && now <= until;
  // The pane can be too narrow for the view the user asked for (Split halves it
  // at 1280, phones force a single day). CalendarViewOptions explains this, but
  // only once you open it — so the header total silently changes from a week to
  // a day with nothing on screen saying why. Say it where the number changed.
  const densityReduced = showCalendarControls && calendarView !== requestedCalendarView;

  return (
    <div className="border-b">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
        <TimerPeriodNav
          isListView={isListView}
          listRangeKey={listRangeKey}
          listRangeSince={listRangeSince}
          listRangeUntil={listRangeUntil}
          onListRangeChange={onListRangeChange}
          onPrev={onPrev}
          onNext={onNext}
          periodNoun={periodNoun}
          onToday={onToday}
          periodIncludesToday={periodIncludesToday}
          label={
            isListView
              ? formatListRangeLabel(listRangeKey, since, until, wso)
              : formatPeriodLabel(since, until, { weekStamp: !isDayView })
          }
          densityReduced={densityReduced}
          calendarView={calendarView}
          requestedCalendarView={requestedCalendarView}
        />

        <div className="flex flex-wrap items-center gap-2">
          {showCalendarControls && (
            <CalendarViewOptions
              calendarView={calendarView}
              requestedCalendarView={requestedCalendarView}
              onCalendarViewChange={onCalendarViewChange}
              slotHeight={slotHeight}
              onZoomIn={onZoomIn}
              onZoomOut={onZoomOut}
              showWeekends={showWeekends}
              onToggleWeekends={onToggleWeekends}
            />
          )}

          <DraftDayButton onClick={onDraftDay} pending={draftPending} pendingCount={draftCount} />

          <TimerViewSwitcher view={view} onChange={onViewChange} allowSplit={allowSplit} />

          <TimerAddEntrySplitButton onAddEntry={onAddEntry} onAiQuickAdd={onAiQuickAdd} />
        </div>
      </div>

      <TimerLoggedBar periodSummary={periodSummary} totalSeconds={totalSeconds} segments={segments} />
    </div>
  );
}
