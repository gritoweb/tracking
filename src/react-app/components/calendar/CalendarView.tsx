import { forwardRef, useCallback, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import type {
  EventInput,
  DateSelectArg,
  EventClickArg,
  DatesSetArg,
  EventDropArg,
  EventMountArg,
} from "@fullcalendar/core";
import type { DateClickArg, EventResizeDoneArg, DropArg } from "@fullcalendar/interaction";
import { CalendarEventContent } from "./CalendarEventContent";
import type { CalendarEventExtendedProps } from "@/lib/calendarMapping";

/** The grid's snap step, and the length of an entry created by a single click on it. */
export const CLICK_ENTRY_MINUTES = 15;

export type CalendarViewType =
  | "timeGridWeek"
  | "timeGridFiveDay"
  | "timeGridDay"
  | "dayGridMonth";

interface CalendarViewProps {
  initialView: CalendarViewType;
  initialDate?: Date;
  slotHeight: number;
  firstDay: number;
  weekends: boolean;
  /** Mirrors uiStore.timeFormat so the grid can't disagree with the list. */
  timeFormat: "24h" | "12h";
  events: EventInput[];
  onSelect: (startIso: string, stopIso: string) => void;
  onDateClick: (startIso: string) => void;
  onEventDrop: (arg: EventDropArg) => void;
  onEventResize: (arg: EventResizeDoneArg) => void;
  onEventClick: (arg: EventClickArg) => void;
  onDatesSet: (arg: DatesSetArg) => void;
  /**
   * An element dragged in from outside the grid (a task from the rail) was
   * dropped on it. Absent means the grid isn't a drop target at all — the
   * pointer shouldn't advertise an affordance that leads nowhere.
   */
  onExternalDrop?: (arg: DropArg) => void;
  /**
   * Right-click on a real, non-running entry. Fired via a native listener on
   * the mounted element (not a component nested in `eventContent`) — FullCalendar
   * renders that content through its own `flushSync`-based portal, and a Radix
   * menu mounted inside it fought that render pass silently (console showed
   * "flushSync was called from inside a lifecycle method" and the menu never
   * opened). The menu itself lives in the parent, positioned at (x, y).
   */
  onEventContextMenu?: (props: CalendarEventExtendedProps, x: number, y: number) => void;
}

// Presentational FullCalendar wrapper. All persistence lives in the parent page;
// this component only translates FC callbacks into typed intents. The forwarded
// ref exposes the FullCalendar instance so the toolbar can drive prev/next/view.
export const CalendarView = forwardRef<FullCalendar, CalendarViewProps>(
  function CalendarView(
    {
      initialView,
      initialDate,
      slotHeight,
      firstDay,
      weekends,
      timeFormat,
      events,
      onSelect,
      onDateClick,
      onEventDrop,
      onEventResize,
      onEventClick,
      onDatesSet,
      onExternalDrop,
      onEventContextMenu,
    },
    ref
  ) {
    // FullCalendar's locale default rendered 13:00 as "1:00" — 12-hour with no
    // meridiem — while EntryRow honoured the user's preference and showed
    // "13:00". In Split both are on screen for the same entry, and on a billing
    // tool two authoritative clocks disagreeing is a trust problem.
    //
    // Match EntryRow's *output*, not just its 12/24-hour choice: it formats via
    // date-fns "h:mm a" / "HH:mm", so 13:00 reads "1:00 PM" or "13:00". FC's
    // 2-digit + short-meridiem default gives "01:00pm" — the same instant in a
    // third notation.
    const hour12 = timeFormat === "12h";
    const timeFmt = hour12
      ? ({ hour: "numeric", minute: "2-digit", hour12: true, meridiem: true } as const)
      : ({ hour: "2-digit", minute: "2-digit", hour12: false, meridiem: false } as const);

    // The drag preview is drawn full-column-width; pin it to the dragged block's share.
    const hostRef = useRef<HTMLDivElement>(null);

    const pinMirror = useCallback((el: HTMLElement) => {
      const harness = el.closest(".fc-timegrid-event-harness");
      const column = el.closest(".fc-timegrid-col-events");
      const host = hostRef.current;
      if (!harness || !column || !host) return;
      const block = harness.getBoundingClientRect();
      const col = column.getBoundingClientRect();
      if (!col.width) return;
      host.style.setProperty("--tt-mirror-left", `${((block.left - col.left) / col.width) * 100}%`);
      host.style.setProperty("--tt-mirror-right", `${((col.right - block.right) / col.width) * 100}%`);
    }, []);

    const releaseMirror = useCallback(() => {
      hostRef.current?.style.removeProperty("--tt-mirror-left");
      hostRef.current?.style.removeProperty("--tt-mirror-right");
    }, []);

    return (
      <div
        ref={hostRef}
        className="tt-calendar min-h-0 flex-1"
        // One grid row per hour; the zoom value stays per half hour, so an hour is two of it.
        style={{ ["--fc-slot-height" as string]: `${slotHeight * 2}px` }}
      >
        <FullCalendar
          ref={ref}
          plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
          initialView={initialView}
          initialDate={initialDate}
          // A work-week (5-day) view alongside the built-in week/day/month views.
          views={{
            timeGridFiveDay: {
              type: "timeGrid",
              duration: { days: 5 },
              buttonText: "5 days",
            },
          }}
          headerToolbar={false}
          height="100%"
          timeZone="local"
          firstDay={firstDay}
          weekends={weekends}
          allDaySlot={false}
          // Split the column: stacking draws a later block over the one still running.
          slotEventOverlap={false}
          nowIndicator
          slotDuration="01:00:00"
          snapDuration={`00:${CLICK_ENTRY_MINUTES}:00`}
          scrollTime="08:00:00"
          eventTimeFormat={timeFmt}
          slotLabelFormat={timeFmt}
          expandRows
          dayHeaderFormat={{ weekday: "short", day: "numeric" }}
          selectable
          selectMirror
          editable
          eventStartEditable
          eventDurationEditable
          eventResizableFromStart
          events={events}
          eventContent={CalendarEventContent}
          eventClassNames={(arg) => {
            const props = arg.event.extendedProps as CalendarEventExtendedProps;
            // The range you drag to create: FullCalendar's own block, not one of ours.
            if (arg.isMirror && !arg.event.id) return ["tt-event-select"];
            if (props.ghost) return ["tt-event-ghost"];
            if (props.draft) return ["tt-event-draft"];
            return props.running ? ["tt-event-running"] : [];
          }}
          select={(arg: DateSelectArg) =>
            onSelect(arg.start.toISOString(), arg.end.toISOString())
          }
          dateClick={(arg: DateClickArg) => onDateClick(arg.date.toISOString())}
          eventDrop={onEventDrop}
          eventResize={onEventResize}
          eventDragStart={(info) => pinMirror(info.el)}
          eventDragStop={releaseMirror}
          eventResizeStart={(info) => pinMirror(info.el)}
          eventResizeStop={releaseMirror}
          eventClick={onEventClick}
          datesSet={onDatesSet}
          droppable={Boolean(onExternalDrop)}
          drop={onExternalDrop}
          eventDidMount={(info: EventMountArg) => {
            if (!onEventContextMenu) return;
            const props = info.event.extendedProps as CalendarEventExtendedProps;
            if (!props.entry || props.running) return;
            // Assigning the property (not addEventListener) needs no manual
            // cleanup — it's overwritten on remount and discarded with the
            // element itself when FullCalendar unmounts it.
            info.el.oncontextmenu = (e: MouseEvent) => {
              e.preventDefault();
              onEventContextMenu(props, e.clientX, e.clientY);
            };
          }}
        />
      </div>
    );
  }
);
