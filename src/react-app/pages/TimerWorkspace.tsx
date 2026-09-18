import { useMemo, useState, Suspense, lazy } from "react";
import { useSearchParams } from "react-router-dom";
import { addWeeks, addMonths, addDays, format, parseISO } from "date-fns";
import { TimerWorkspaceHeader } from "@/components/timer/TimerWorkspaceHeader";
import { TimerWorkspaceBody } from "@/components/timer/TimerWorkspaceBody";
import { TIMER_PANEL_ID, timerTabId } from "@/components/timer/timerTabs";
import { AddEntryDialog } from "@/components/entries/AddEntryDialog";
import { useEntriesRange } from "@/hooks/useEntries";
import { useDraftRange, useGenerateDrafts } from "@/hooks/useDrafts";
import { resolveTimerPeriod, summarizeLoggedSegments, matchListRangeKey, parseDateParam } from "@/lib/timerPeriod";
import { useUIStore, CALENDAR_SLOT_HEIGHT_STEP } from "@/stores/uiStore";
import { useDayRollover } from "@/hooks/useDayRollover";
import { useMediaQuery, BELOW_MD, BELOW_LG } from "@/hooks/useMediaQuery";
import { useElementWidth } from "@/hooks/useElementWidth";
import { resolveCalendarDensity } from "@/lib/calendarDensity";
import type { TimerView } from "@/stores/uiStore";
import type { CalendarViewType } from "@/components/calendar/CalendarView";

// Review pulls in the project picker and the entry controls; it's only ever
// opened deliberately, so it shouldn't sit in the Timer landing chunk.
const DraftReviewDialog = lazy(() =>
  import("@/components/drafts/DraftReviewDialog").then((m) => ({
    default: m.DraftReviewDialog,
  }))
);

// The rail pulls FullCalendar's Draggable, so it rides the same lazy boundary
// as the grid it drags onto rather than the Timer landing chunk.
const TaskRailLazy = lazy(() => import("@/components/tasks/TaskRail").then((m) => ({ default: m.TaskRail })));

// The unified Timer tab: owns the navigable week + active view, renders the
// shared header, and swaps the body between list / calendar / split / timesheet
// / planner.
export function TimerWorkspace() {
  const view = useUIStore((s) => s.timerView);
  const setView = useUIStore((s) => s.setTimerView);
  const calendarView = useUIStore((s) => s.calendarView) as CalendarViewType;
  const setCalendarView = useUIStore((s) => s.setCalendarView);
  const slotHeight = useUIStore((s) => s.calendarSlotHeight);
  const setSlotHeight = useUIStore((s) => s.setCalendarSlotHeight);
  const weekStart = useUIStore((s) => s.weekStart);
  const showWeekends = useUIStore((s) => s.showWeekends);
  const setShowWeekends = useUIStore((s) => s.setShowWeekends);
  const openQuickAdd = useUIStore((s) => s.openQuickAdd);
  const listRangeKey = useUIStore((s) => s.listRangeKey);
  const listRangeSince = useUIStore((s) => s.listRangeSince);
  const listRangeUntil = useUIStore((s) => s.listRangeUntil);
  const setListRange = useUIStore((s) => s.setListRange);
  const wso = weekStart as 0 | 1 | 2 | 3 | 4 | 5 | 6;

  // Split cannot work in one column: below lg it collapsed to a bare row of
  // day-number headers with no grid body, orphaned above the list.
  const belowLg = useMediaQuery(BELOW_LG);
  const belowMd = useMediaQuery(BELOW_MD);

  const effectiveView: TimerView = view === "split" && belowLg ? "list" : view;
  const isCalendarish = effectiveView === "calendar" || effectiveView === "split";

  // Grid density comes from the calendar pane's own width, not the viewport.
  // Split halves the pane while leaving the viewport untouched, so a
  // viewport-based rule left Split at 1280 rendering 50px columns. See
  // resolveCalendarDensity. Until the first measurement lands, fall back to a
  // viewport guess so the first paint isn't chosen from a width of nothing.
  const { ref: calendarPaneRef, width: paneWidth } = useElementWidth<HTMLDivElement>();
  const effectiveCalendarView: CalendarViewType = resolveCalendarDensity(
    calendarView,
    paneWidth,
    belowMd ? 1 : 7
  );

  // The month view navigates and scopes by calendar month; the forced day view
  // by day; everything else by week.
  const isMonthView = isCalendarish && effectiveCalendarView === "dayGridMonth";
  const isDayView = isCalendarish && effectiveCalendarView === "timeGridDay";

  // Every period this component resolves is relative to "now", so both the
  // memo below and the default anchor have to be recomputed when the calendar
  // day rolls over under an open tab — see useDayRollover.
  const dayKey = useDayRollover();

  // `null` means "follow the clock": the grid views open on today and keep
  // following it across midnight. Stepping or revealing a date pins an explicit
  // anchor; the Today button releases it again.
  // `/?date=YYYY-MM-DD` opens on that day: the link an Assistant reply gives for a time entry.
  const [searchParams] = useSearchParams();
  const [anchorOverride, setAnchorOverride] = useState<Date | null>(() => parseDateParam(searchParams.get("date")));
  const today = useMemo(() => parseISO(dayKey), [dayKey]);
  const anchor = anchorOverride ?? today;

  const isListView = effectiveView === "list";
  const { since, until } = useMemo(
    () =>
      resolveTimerPeriod({
        isListView,
        isMonthView,
        isDayView,
        listRangeKey,
        listRangeSince,
        listRangeUntil,
        weekStartsOn: wso,
        today,
        anchor,
      }),
    [anchor, today, isMonthView, isDayView, isListView, listRangeKey, listRangeSince, listRangeUntil, wso]
  );

  const [addEntryOpen, setAddEntryOpen] = useState(false);

  /**
   * Which day drafting and review act on.
   *
   * Today when the visible period contains it, otherwise the first day of the
   * period. Drafting tomorrow is meaningless (nothing has happened yet), and
   * silently drafting a day the user isn't looking at would be worse.
   */
  const reviewDate = format(today >= since && today <= until ? today : since, "yyyy-MM-dd");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewDay, setReviewDay] = useState<string>(reviewDate);
  const generateDrafts = useGenerateDrafts(reviewDate);
  const { data: periodDrafts = [] } = useDraftRange(format(since, "yyyy-MM-dd"), format(until, "yyyy-MM-dd"));

  const openReview = (day: string) => {
    setReviewDay(day);
    setReviewOpen(true);
  };

  // Drafting and reviewing are one button: propose what's missing, then show
  // the result. When proposals are already waiting, skip straight to them
  // rather than making the user ask for more of what they haven't looked at.
  const handleDraftDay = () => {
    const waiting = periodDrafts.filter((d) => d.localDate === reviewDate);
    if (waiting.length > 0) {
      openReview(reviewDate);
      return;
    }
    generateDrafts.mutate(undefined, {
      onSuccess: (result) => {
        if (result.drafts.length > 0) openReview(reviewDate);
      },
    });
  };

  /**
   * Carry the period across a view switch.
   *
   * The list scopes by an explicit range; the grid views step by week/month/day.
   * Left unlinked, tabbing List → Calendar silently changed both the visible
   * dates and the header total (38h 30m → 6h 30m) with nothing to mark it — the
   * single most corrosive defect for someone about to put that number on an
   * invoice. Now the period follows the user in both directions, so in the common
   * case the two views agree.
   *
   * A grid period is usually narrower than the list range, so leaving the list
   * has to choose *which* part of it to land on. Prefer the one containing today
   * — a list showing this week opens Split on today, not on Monday, and "All
   * dates" opens on this week rather than on the epoch. Only when the range is
   * entirely in the past (or future) does the grid fall back to its first day.
   */
  const changeView = (next: TimerView) => {
    const leavingList = effectiveView === "list" && next !== "list";
    const enteringList = effectiveView !== "list" && next === "list";

    if (leavingList) {
      setAnchorOverride(today >= since && today <= until ? today : since);
    } else if (enteringList && !belowMd) {
      const r = matchListRangeKey(since, until, wso, today);
      setListRange(r.key, r.since, r.until);
    }
    // Below md the calendar is forced to a single day by *layout*, not by the
    // user asking for a day. Writing that back into the list range turned every
    // phone view-switch into "Custom range / Logged today", dropping the total
    // from a week to a day — reintroducing on phones exactly the drift this
    // function exists to prevent. The user's own list range is left intact.
    setView(next);
  };

  // Week entries drive the "Logged" bar. Shares the ["time-entries", since, until]
  // query key with the body views, so this is deduped, not a second fetch.
  const { data: entries = [] } = useEntriesRange(since.toISOString(), until.toISOString());
  const { periodSeconds, segments } = useMemo(() => summarizeLoggedSegments(entries), [entries]);

  /** Move whichever period control is active so `date` becomes visible. */
  const revealDate = (date: Date) => {
    setAnchorOverride(date);
    if (effectiveView === "list") {
      setListRange("custom", format(date, "yyyy-MM-dd"), format(date, "yyyy-MM-dd"));
    }
  };

  // Stepping pins the anchor: from here on the grid stays where the user put it
  // rather than following the clock (`?? today` only applies while unpinned).
  const step = (dir: 1 | -1) =>
    setAnchorOverride((d) => {
      const from = d ?? anchor;
      return isMonthView ? addMonths(from, dir) : isDayView ? addDays(from, dir) : addWeeks(from, dir);
    });

  return (
    <div className="flex h-full flex-col">
      <TimerWorkspaceHeader
        since={since}
        until={until}
        totalSeconds={periodSeconds}
        segments={segments}
        view={effectiveView}
        onViewChange={changeView}
        allowSplit={!belowLg}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        periodNoun={isMonthView ? "month" : isDayView ? "day" : "week"}
        weekStartsOn={wso}
        onToday={() => setAnchorOverride(null)}
        onAddEntry={() => setAddEntryOpen(true)}
        onAiQuickAdd={openQuickAdd}
        onDraftDay={handleDraftDay}
        draftPending={generateDrafts.isPending}
        draftCount={periodDrafts.length}
        calendarView={effectiveCalendarView}
        requestedCalendarView={calendarView}
        onCalendarViewChange={setCalendarView}
        slotHeight={slotHeight}
        onZoomIn={() => setSlotHeight(slotHeight + CALENDAR_SLOT_HEIGHT_STEP)}
        onZoomOut={() => setSlotHeight(slotHeight - CALENDAR_SLOT_HEIGHT_STEP)}
        showWeekends={showWeekends}
        onToggleWeekends={() => setShowWeekends(!showWeekends)}
        listRangeKey={listRangeKey}
        listRangeSince={listRangeSince}
        listRangeUntil={listRangeUntil}
        onListRangeChange={setListRange}
      />

      {/* The rail sits beside the grid, not above or inside it: dragging a task
          onto a time slot only works when the source and the target are on the
          same screen, and a plan you can see beside the day is the whole reason
          the rail exists. Grid views only — the timesheet and planner are their
          own dense grids and a third column would crush them. */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          id={TIMER_PANEL_ID}
          role="tabpanel"
          aria-labelledby={timerTabId(view)}
          // min-w-0: FullCalendar's grid has an intrinsic width, so without it
          // this pane refuses to shrink and the rail is pushed off the viewport
          // edge — its collapse control and quick-add clipped by the window.
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
        >
          <TimerWorkspaceBody
            view={effectiveView}
            since={since}
            until={until}
            calendarView={effectiveCalendarView}
            slotHeight={slotHeight}
            weekStartsOn={wso}
            showWeekends={showWeekends}
            belowLg={belowLg}
            onReviewDay={openReview}
            onAddEntry={() => setAddEntryOpen(true)}
            calendarPaneRef={calendarPaneRef}
          />
        </div>
        {isCalendarish && !belowLg && (
          <Suspense fallback={null}>
            <TaskRailLazy />
          </Suspense>
        )}
      </div>

      <AddEntryDialog
        open={addEntryOpen}
        onClose={() => setAddEntryOpen(false)}
        visibleRange={{ since, until }}
        onRevealDate={revealDate}
      />

      {reviewOpen && (
        <Suspense fallback={null}>
          <DraftReviewDialog
            // Keyed by day: opening review on a different date remounts it, so
            // the card index and the total field start clean without an effect.
            key={reviewDay}
            open={reviewOpen}
            localDate={reviewDay}
            onClose={() => setReviewOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
}
