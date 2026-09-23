import type { CSSProperties } from "react";
import type { EventContentArg } from "@fullcalendar/core";
import { CalendarPlus, Wand2 } from "lucide-react";
import { formatDurationShort } from "@/lib/dateUtils";
import { ColorDot, DEFAULT_PROJECT_COLOR } from "@/components/ColorDot";
import { ProjectBadge } from "@/components/ProjectBadge";
import { Avatar } from "@/components/ui/avatar";
import type { CalendarEventExtendedProps } from "@/lib/calendarMapping";

// Custom renderer for a calendar block. Passed to FullCalendar's `eventContent`.
// Kept intentionally compact so short (15–30 min) blocks stay legible.
export function CalendarEventContent(arg: EventContentArg) {
  const { entry, running, ghost, external, draft } =
    arg.event.extendedProps as Partial<CalendarEventExtendedProps>;

  // Draft = a proposed entry waiting for review. Reads like a real block (it
  // carries a project and a description) but with the wand marking it as
  // something the app wrote rather than something the user tracked.
  if (draft) {
    const draftColor = draft.projectColor ?? DEFAULT_PROJECT_COLOR;
    return (
      <div className="flex h-full flex-col gap-0.5 overflow-hidden text-left leading-tight">
        <div className="flex items-center gap-1">
          <Wand2 className="tt-on-tint-muted h-3 w-3 shrink-0" />
          <span className="truncate text-xs font-medium">
            {draft.description || "Untracked time"}
          </span>
        </div>
        <span className="tt-on-tint-muted truncate text-micro">
          {arg.timeText} · draft
        </span>
        {draft.projectName && (
          <span
            className="tt-swatch-ink truncate text-micro font-medium"
            style={{ "--swatch": draftColor } as CSSProperties}
          >
            {draft.projectName}
          </span>
        )}
      </div>
    );
  }

  // Ghost = an unconfirmed external calendar event. Muted look + a "click to
  // track" affordance so it reads as an action, not a real tracked block.
  if (ghost) {
    return (
      <div className="flex h-full flex-col gap-0.5 overflow-hidden text-left leading-tight opacity-90">
        <div className="flex items-center gap-1">
          <CalendarPlus className="tt-on-tint-muted h-3 w-3 shrink-0" />
          <span className="truncate text-xs font-medium">{external?.title ?? "(no title)"}</span>
        </div>
        <span className="tt-on-tint-muted truncate text-micro">
          {arg.timeText} · click to track
        </span>
      </div>
    );
  }

  // Selection mirror / drag placeholder events carry no entry — render minimally
  // instead of crashing (which would break FullCalendar's React subtree).
  if (!entry) {
    return (
      <div className="px-1.5 py-1 text-xs font-medium">{arg.timeText}</div>
    );
  }
  const color = entry.projectColor ?? DEFAULT_PROJECT_COLOR;

  const body = (
    <div className="tt-event-body gap-0.5 text-left leading-tight">
      <div className="flex items-center gap-1">
        {running && <ColorDot color={color} className="tt-running-dot h-1.5 w-1.5" />}
        <span className="truncate text-xs font-medium">
          {entry.description || "(no description)"}
        </span>
      </div>
      {/* Class hooks let the block drop detail as its own width shrinks —
          see the @container rules in css/components/fullcalendar.css. */}
      <div className="tt-event-meta tt-on-tint-muted flex items-center gap-1.5 whitespace-nowrap text-micro">
        <span className="font-mono">{arg.timeText}</span>
        <span className="tt-event-sep" aria-hidden>
          ·
        </span>
        <span className="tt-event-dur">
          {running ? "running" : formatDurationShort(entry.duration ?? 0)}
        </span>
      </div>
      {entry.clientName && (
        <span className="tt-on-tint-muted truncate text-micro" title={entry.clientName}>
          {entry.clientName}
        </span>
      )}
      {/* Same footer as a task card: project badge, then who logged it as an avatar. */}
      {(entry.projectName || entry.userName) && (
        <div className="flex min-w-0 items-center gap-1">
          {entry.projectName && (
            <ProjectBadge name={entry.projectName} color={entry.projectColor} className="min-w-0 px-1 py-0 text-micro" />
          )}
          {entry.userName && (
            <Avatar
              name={entry.userName}
              email={entry.userEmail}
              image={entry.userImage}
              size="xs"
              title={`Logged by ${entry.userName}`}
              className="ml-auto shrink-0"
            />
          )}
        </div>
      )}
    </div>
  );

  return body;
}
