import type { KeyboardEvent } from "react";
import { TimeRangePopover } from "./TimeRangePopover";
import { SavedTick } from "./SavedTick";
import { cn } from "@/lib/utils";
import { formatDurationShort, formatEntryTime } from "@/lib/dateUtils";
import type { TimeEntry } from "@shared/schemas";

type TimeFormat = "24h" | "12h";

interface EntryRowTimingProps {
  entry: TimeEntry;
  timeFormat: TimeFormat;
  onRangeChange: (data: { start: string; stop: string | null }) => void;
  rangeSaved: boolean;
  editingDuration: boolean;
  durationInput: string;
  durationInvalid: boolean;
  onDurationInputChange: (value: string) => void;
  onDurationBlur: () => void;
  onDurationKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  onStartEditDuration: () => void;
  durationSaved: boolean;
}

/** The row's time-range popover (desktop) and the click-to-edit duration figure. */
export function EntryRowTiming({
  entry,
  timeFormat,
  onRangeChange,
  rangeSaved,
  editingDuration,
  durationInput,
  durationInvalid,
  onDurationInputChange,
  onDurationBlur,
  onDurationKeyDown,
  onStartEditDuration,
  durationSaved,
}: EntryRowTimingProps) {
  return (
    <>
      {/* Time range — click to edit start/stop + date inline. A running entry
          has no stop yet but its start is just as correctable, and it used to
          be the one row you couldn't fix without opening the sheet. */}
      <span className="relative hidden sm:inline-flex">
        <SavedTick saved={rangeSaved} />
        <TimeRangePopover
          start={entry.start}
          stop={entry.stop}
          onChange={onRangeChange}
          // font-mono + tabular-nums + a fixed width, like the duration
          // beside it. Without them this was the one number in the row that
          // wasn't in a column: proportional digits made the trigger's width
          // depend on which digits it held, which walked the billable "$"
          // before it across a measured 13px down a single list while the
          // durations held an exact column. DESIGN.md §8 asks for tabular
          // figures in any list column, and this is the app's most-read list.
          //
          // The width is per-format because 12h is genuinely wider and its
          // strings are ragged ("9:00 AM" vs "11:15 AM"); justify-end pulls
          // the short ones into the same right edge.
          triggerClassName={cn(
            "flex items-center justify-end gap-1 px-1 font-mono text-xs tabular-nums text-muted-foreground",
            timeFormat === "12h" ? "w-[9.25rem]" : "w-[6.5rem]"
          )}
        >
          <span>{formatEntryTime(entry.start, timeFormat)}</span>
          <span>–</span>
          <span>{entry.stop ? formatEntryTime(entry.stop, timeFormat) : "…"}</span>
        </TimeRangePopover>
      </span>

      {/* Duration — click to edit */}
      {editingDuration ? (
        <input
          autoFocus
          value={durationInput}
          onChange={(e) => onDurationInputChange(e.target.value)}
          onBlur={onDurationBlur}
          onKeyDown={onDurationKeyDown}
          aria-label="Duration"
          aria-invalid={durationInvalid}
          // "1h 30m" needs more room than "01:30:00" did, and the width has to
          // match the button below or the row shifts on every click.
          title={durationInvalid ? "Enter a duration like 1h 30m, 1:30, or 90m" : undefined}
          className={cn(
            "w-20 bg-transparent text-right font-mono text-sm tabular-nums outline-none ring-0 border-b",
            durationInvalid ? "border-destructive text-destructive" : "border-primary"
          )}
        />
      ) : (
        <span className="relative">
          <SavedTick saved={durationSaved} />
          <button
            onClick={onStartEditDuration}
            className="hit-area focus-ring min-w-20 rounded-sm text-right font-mono text-sm tabular-nums transition-colors duration-fast ease-out-quart hover:text-primary-ink"
          >
            {entry.duration ? formatDurationShort(entry.duration) : "–"}
          </button>
        </span>
      )}
    </>
  );
}
