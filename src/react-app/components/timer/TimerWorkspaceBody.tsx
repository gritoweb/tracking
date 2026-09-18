import { Suspense, lazy, type RefCallback } from "react";
import { EntryList } from "@/components/entries/EntryList";
import { Spinner } from "@/components/ui/spinner";
import type { CalendarViewType } from "@/components/calendar/CalendarView";
import type { TimerView } from "@/stores/uiStore";

// FullCalendar (~270 kB) and the timesheet/planner grids load only when their
// view is selected, keeping the eager Timer landing route lean.
const CalendarBody = lazy(() =>
  import("@/components/calendar/CalendarBody").then((m) => ({ default: m.CalendarBody }))
);
const TimesheetView = lazy(() =>
  import("@/components/timesheet/TimesheetView").then((m) => ({ default: m.TimesheetView }))
);
const PlannerView = lazy(() =>
  import("@/components/planner/PlannerView").then((m) => ({ default: m.PlannerView }))
);

function BodyFallback() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <Spinner size="lg" className="text-muted-foreground" />
    </div>
  );
}

interface TimerWorkspaceBodyProps {
  view: TimerView; // the resolved (post-breakpoint) view
  since: Date;
  until: Date;
  calendarView: CalendarViewType;
  slotHeight: number;
  weekStartsOn: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  showWeekends: boolean;
  belowLg: boolean;
  onReviewDay: (day: string) => void;
  onAddEntry: () => void;
  calendarPaneRef: RefCallback<HTMLDivElement>;
}

/** Swaps the Timer tab's body between list / calendar / split / timesheet / planner. Pure view. */
export function TimerWorkspaceBody({
  view,
  since,
  until,
  calendarView,
  slotHeight,
  weekStartsOn,
  showWeekends,
  belowLg,
  onReviewDay,
  onAddEntry,
  calendarPaneRef,
}: TimerWorkspaceBodyProps) {
  // In split the entry list sits beside the grid and explains an empty period
  // itself, so the grid's own overlay would just say it twice.
  const calendarFor = (v: TimerView) => (
    <CalendarBody
      periodStart={since}
      calendarView={calendarView}
      slotHeight={slotHeight}
      weekStartsOn={weekStartsOn}
      showWeekends={showWeekends}
      showEmptyState={v !== "split"}
      onReviewDay={onReviewDay}
      // The rail only renders at lg and up, and only beside a grid — below that
      // there is nothing to drag from, so the grid shouldn't claim to accept one.
      acceptTaskDrops={!belowLg}
    />
  );
  const list = <EntryList since={since} until={until} onAddEntry={onAddEntry} />;

  if (view === "calendar")
    return (
      <Suspense fallback={<BodyFallback />}>
        <div ref={calendarPaneRef} className="flex min-h-0 flex-1 flex-col">
          {calendarFor("calendar")}
        </div>
      </Suspense>
    );
  if (view === "timesheet")
    return (
      <Suspense fallback={<BodyFallback />}>
        <TimesheetView weekStart={since} />
      </Suspense>
    );
  if (view === "planner")
    return (
      <Suspense fallback={<BodyFallback />}>
        <PlannerView weekStart={since} />
      </Suspense>
    );
  if (view === "split")
    // Only reachable at lg and up — below that the caller already resolved to "list".
    return (
      <Suspense fallback={<BodyFallback />}>
        <div className="grid min-h-0 flex-1 grid-cols-1 divide-x lg:grid-cols-2">
          <div ref={calendarPaneRef} className="flex min-h-0 flex-col">
            {calendarFor("split")}
          </div>
          <div className="flex min-h-0 flex-col overflow-hidden">{list}</div>
        </div>
      </Suspense>
    );
  return list;
}
