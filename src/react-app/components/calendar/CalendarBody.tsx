import { useMemo, useRef, useState, useEffect } from "react";
import type FullCalendar from "@fullcalendar/react";
import type { EventClickArg } from "@fullcalendar/core";
import {
  endOfWeek,
  startOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
} from "date-fns";
import { CalendarView, CLICK_ENTRY_MINUTES, type CalendarViewType } from "./CalendarView";
import { CalendarCreateDialog } from "./CalendarCreateDialog";
import { CalendarBodyOverlays } from "./CalendarBodyOverlays";
import { CalendarEventContextMenu } from "./CalendarEventContextMenu";
import { useCalendarEntryActions } from "./useCalendarEntryActions";
import { EntryForm, type EditableEntry } from "@/components/forms/EntryForm";
import { useEntriesRange } from "@/hooks/useEntries";
import { useCalendarEvents, useConvertCalendarRange } from "@/hooks/useCalendarSync";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import {
  buildEvents,
  draftToEvent,
  externalEventToEvent,
  type CalendarEventExtendedProps,
} from "@/lib/calendarMapping";
import { useDraftRange } from "@/hooks/useDrafts";
import { localDayKey } from "@/lib/dateUtils";

import "@/css/components/fullcalendar.css";

interface CalendarBodyProps {
  // Start of the visible period: a week start for time-grid views, a month
  // start for the month view.
  periodStart: Date;
  calendarView: CalendarViewType;
  slotHeight: number;
  weekStartsOn: number; // 0=Sun … 6=Sat
  showWeekends: boolean;
  /**
   * False in split view, where the entry list beside this grid renders its own
   * "nothing tracked" state. Two of them side by side, in near-identical
   * words, read as a rendering fault rather than an explanation.
   */
  showEmptyState?: boolean;
  /**
   * Open review for a local day. Absent means drafts aren't painted at all —
   * a proposal you can't act on is just clutter on the grid.
   */
  onReviewDay?: (localDate: string) => void;
  /**
   * Accept tasks dragged in from the rail. Off in split view's second pane and
   * anywhere the rail isn't on screen — a drop target with nothing to drop is
   * just a cursor that lies.
   */
  acceptTaskDrops?: boolean;
}

// The FullCalendar grid, externally driven by the shared period + view.
// Extracted from the old standalone CalendarPage so it can be embedded in the
// unified Timer tab (calendar + split views) under one shared header.
export function CalendarBody({
  periodStart,
  calendarView,
  slotHeight,
  weekStartsOn,
  showWeekends,
  showEmptyState = true,
  onReviewDay,
  acceptTaskDrops = false,
}: CalendarBodyProps) {
  // date-fns wants a 0–6 literal; the setting is validated to that range.
  const wso = weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const calendarRef = useRef<FullCalendar>(null);
  const api = () => calendarRef.current?.getApi();

  // Captured once — FullCalendar's initialView/initialDate must be constant;
  // subsequent view/date changes are driven imperatively via the API below.
  const [initialView] = useState<CalendarViewType>(calendarView);
  const [initialDate] = useState<Date>(periodStart);

  // Fetch range: the whole month grid (incl. leading/trailing days) for month
  // view, the single day for the day view, otherwise the full week — the 5-day
  // view just shows fewer columns of the week its header names.
  //
  // The day view must scope to `periodStart` alone, and the grid must open on
  // it rather than on today. It used to fetch the containing week and then
  // `gotoDate(today)` whenever today fell anywhere inside it, while the header,
  // the "Logged" strip, the totals and the entry pane all stayed on
  // `periodStart` — so entering Split on a past day showed "Mon, Aug 17 ·
  // Logged 5h" beside an empty Sunday grid, and the user couldn't tell which
  // pane was lying. TimerWorkspace already narrows the shared period to
  // startOfDay/endOfDay for this view, so following it is all that's needed.
  const range = useMemo(() => {
    if (calendarView === "dayGridMonth") {
      return {
        start: startOfWeek(startOfMonth(periodStart), { weekStartsOn: wso }),
        end: endOfWeek(endOfMonth(periodStart), { weekStartsOn: wso }),
      };
    }
    if (calendarView === "timeGridDay") {
      return { start: startOfDay(periodStart), end: endOfDay(periodStart) };
    }
    return { start: periodStart, end: endOfWeek(periodStart, { weekStartsOn: wso }) };
  }, [periodStart, calendarView, wso]);

  // Drive FullCalendar imperatively when the shared period or view changes.
  useEffect(() => {
    const a = api();
    if (!a) return;
    if (a.view.type !== calendarView) a.changeView(calendarView);
    a.gotoDate(periodStart);
  }, [calendarView, periodStart]);

  // Advance "now" every minute so the running entry's live block grows.
  const [nowIso, setNowIso] = useState(() => new Date().toISOString());
  useEffect(() => {
    const t = setInterval(() => setNowIso(new Date().toISOString()), 60_000);
    return () => clearInterval(t);
  }, []);

  const {
    data: entries = [],
    isLoading: entriesLoading,
    isError: entriesError,
    refetch: refetchEntries,
  } = useEntriesRange(range.start.toISOString(), range.end.toISOString());

  const timeFormat = useUIStore((s) => s.timeFormat);
  const runningEntry = useTimerStore((s) => s.runningEntry);
  const { handleMoveOrResize, handleTaskDrop, handleDuplicate, handleDeleteEntry } =
    useCalendarEntryActions(timeFormat);

  const { data: externalEvents = [] } = useCalendarEvents(
    range.start.toISOString(),
    range.end.toISOString()
  );

  // Drafts are stored against the user's LOCAL date, so the range is asked for
  // in those terms rather than as UTC instants.
  const { data: drafts = [] } = useDraftRange(
    localDayKey(range.start.toISOString()),
    localDayKey(range.end.toISOString()),
    Boolean(onReviewDay)
  );

  const { events, ghostCount } = useMemo(() => {
    const real = buildEvents(entries, runningEntry, range, nowIso);
    const confirmed = new Set(
      entries.map((e) => e.calendarEventId).filter(Boolean) as string[]
    );
    const unconfirmed = externalEvents.filter((ext) => !confirmed.has(ext.calendarEventId));
    const ghosts = unconfirmed.map(externalEventToEvent);
    // A drafted meeting and its ghost are the same hour twice — the draft is the
    // better of the two (it carries a project and a description), so it wins.
    const draftedEventIds = new Set(
      drafts.map((d) => d.calendarEventId).filter(Boolean) as string[]
    );
    const visibleGhosts = ghosts.filter(
      (g) => !draftedEventIds.has(String(g.id).replace(/^ghost:/, ""))
    );
    const draftBlocks = drafts.map(draftToEvent);
    return {
      events: [...draftBlocks, ...real, ...visibleGhosts],
      // What the "Convert N events" button offers to do — the ghosts still on
      // screen, not every unconfirmed event (a drafted one is already handled).
      ghostCount: visibleGhosts.length,
    };
  }, [entries, runningEntry, range, nowIso, externalEvents, drafts]);

  const convertRange = useConvertCalendarRange();
  const handleConvertAll = () =>
    convertRange.mutate({
      since: range.start.toISOString(),
      until: range.end.toISOString(),
    });

  const [createOpen, setCreateOpen] = useState(false);
  const [createRange, setCreateRange] = useState<{
    start: string;
    stop: string;
    description?: string;
    calendarEventId?: string;
  }>(() => {
    const start = new Date();
    start.setMinutes(Math.round(start.getMinutes() / 15) * 15, 0, 0);
    const stop = new Date(start.getTime() + 60 * 60 * 1000);
    return { start: start.toISOString(), stop: stop.toISOString() };
  });
  const [editEntry, setEditEntry] = useState<EditableEntry | null>(null);

  const handleSelect = (startIso: string, stopIso: string) => {
    setCreateRange({ start: startIso, stop: stopIso });
    setCreateOpen(true);
  };

  const handleDateClick = (startIso: string) => {
    // A click marks one snap step; it used to open a fixed hour, so a 15-minute slot came out as 1h.
    const stopIso = new Date(new Date(startIso).getTime() + CLICK_ENTRY_MINUTES * 60 * 1000).toISOString();
    setCreateRange({ start: startIso, stop: stopIso });
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCreateOpen(false);
    api()?.unselect();
  };

  const handleEventClick = (arg: EventClickArg) => {
    const props = arg.event.extendedProps as CalendarEventExtendedProps;
    if (props.draft) {
      onReviewDay?.(props.draft.localDate);
      return;
    }
    if (props.ghost && props.external) {
      setCreateRange({
        start: props.external.start,
        stop: props.external.stop,
        description: props.external.title,
        calendarEventId: props.external.calendarEventId,
      });
      setCreateOpen(true);
      return;
    }
    if (props.entry) setEditEntry(props.entry);
  };

  const [contextMenu, setContextMenu] = useState<{
    entry: EditableEntry;
    x: number;
    y: number;
  } | null>(null);

  const handleEventContextMenu = (
    props: CalendarEventExtendedProps,
    x: number,
    y: number
  ) => {
    if (props.entry) setContextMenu({ entry: props.entry, x, y });
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden p-2">
      <CalendarBodyOverlays
        entriesLoading={entriesLoading}
        entriesError={entriesError}
        onRetry={() => refetchEntries()}
        showEmptyState={showEmptyState}
        isEmpty={events.length === 0}
        ghostCount={ghostCount}
        onConvertAll={handleConvertAll}
        convertPending={convertRange.isPending}
      />

      <CalendarView
        ref={calendarRef}
        initialView={initialView}
        initialDate={initialDate}
        slotHeight={slotHeight}
        firstDay={weekStartsOn}
        weekends={showWeekends}
        timeFormat={timeFormat}
        events={events}
        onSelect={handleSelect}
        onDateClick={handleDateClick}
        onEventDrop={handleMoveOrResize}
        onEventResize={handleMoveOrResize}
        onEventClick={handleEventClick}
        onDatesSet={() => {}}
        onExternalDrop={
          acceptTaskDrops && calendarView !== "dayGridMonth" ? handleTaskDrop : undefined
        }
        onEventContextMenu={handleEventContextMenu}
      />

      <CalendarEventContextMenu
        contextMenu={contextMenu}
        onClose={() => setContextMenu(null)}
        onEdit={setEditEntry}
        onDuplicate={handleDuplicate}
        onDelete={handleDeleteEntry}
      />

      <CalendarCreateDialog
        open={createOpen}
        startIso={createRange.start}
        stopIso={createRange.stop}
        description={createRange.description}
        calendarEventId={createRange.calendarEventId}
        onClose={closeCreate}
      />

      {editEntry && (
        <EntryForm
          entry={editEntry}
          open={Boolean(editEntry)}
          onClose={() => setEditEntry(null)}
        />
      )}
    </div>
  );
}
