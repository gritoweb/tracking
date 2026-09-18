import type { KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { AssignProjectChip } from "@/components/pickers/ProjectPicker";
import { ColorDot } from "@/components/ColorDot";
import { ProjectBadge } from "@/components/ProjectBadge";
import { TimeRangePopover } from "./TimeRangePopover";
import { SavedTick } from "./SavedTick";
import { formatEntryTime } from "@/lib/dateUtils";
import type { TimeEntry } from "@shared/schemas";

type TimeFormat = "24h" | "12h";

interface EntryRowDescriptionProps {
  entry: TimeEntry;
  desc: string;
  editingDesc: boolean;
  onDescChange: (value: string) => void;
  onStartEdit: () => void;
  onDescBlur: () => void;
  onDescKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
  descSaved: boolean;
  timeFormat: TimeFormat;
  onRangeChange: (data: { start: string; stop: string | null }) => void;
  projectSaved: boolean;
  onAssignProject: (projectId: string) => void;
  tagColor: (name: string) => string;
}

/** Description (inline edit), the mobile time range, and the project/tags row beneath it. */
export function EntryRowDescription({
  entry,
  desc,
  editingDesc,
  onDescChange,
  onStartEdit,
  onDescBlur,
  onDescKeyDown,
  descSaved,
  timeFormat,
  onRangeChange,
  projectSaved,
  onAssignProject,
  tagColor,
}: EntryRowDescriptionProps) {
  return (
    <div className="relative min-w-0 flex-1">
      <SavedTick saved={descSaved} className="-right-3" />
      {editingDesc ? (
        <input
          autoFocus
          // The inline editor had no accessible name at all — a screen reader
          // landed on an unlabelled text field. The button it replaces reads
          // out the description itself, so the swap lost the only context.
          aria-label="Description"
          value={desc}
          onChange={(e) => onDescChange(e.target.value)}
          onBlur={onDescBlur}
          onKeyDown={onDescKeyDown}
          className="w-full border-b border-primary/40 bg-transparent text-sm outline-none ring-0"
        />
      ) : (
        <button
          // Use the system focus ring rather than a bare underline: a third
          // focus vocabulary in one page means keyboard users have to relearn
          // "where am I" per control.
          className="hit-area focus-ring rounded-sm text-left text-sm transition-colors duration-fast ease-out-quart hover:text-primary-ink"
          onClick={onStartEdit}
        >
          {entry.description || <span className="italic text-muted-foreground">No description</span>}
        </button>
      )}

      {/* Project + tags row. Below `sm` this line also carries the time
          range: the row's horizontal rail has no space for it there (adding
          it pushed the row to 568px inside a 390px viewport and clipped the
          duration off the end), but correcting "that meeting started at
          14:00, not 13:30" is the single most likely edit on a phone, and
          dropping the control entirely meant it could not be made from the
          list at all. One of the two instances is always `hidden`, so it
          adds no tab stop. */}
      <div className="mt-0.5 flex flex-wrap items-center gap-1">
        <span className="relative inline-flex sm:hidden">
          <TimeRangePopover
            start={entry.start}
            stop={entry.stop}
            onChange={onRangeChange}
            triggerClassName="flex items-center gap-1 rounded-sm px-1 text-micro tabular-nums text-muted-foreground"
          >
            <span>{formatEntryTime(entry.start, timeFormat)}</span>
            <span>–</span>
            <span>{entry.stop ? formatEntryTime(entry.stop, timeFormat) : "…"}</span>
          </TimeRangePopover>
        </span>
        {entry.projectName ? (
          <ProjectBadge
            name={entry.clientName ? `${entry.projectName} · ${entry.clientName}` : entry.projectName}
            color={entry.projectColor}
          />
        ) : (
          <span className="relative">
            <SavedTick saved={projectSaved} className="-right-3" />
            {/* Assigning a project is an inline commit like the others and
                gets the same acknowledgement — it was the one that said
                nothing at all. */}
            <AssignProjectChip
              // Scoped like the group chip's label. The bare "Assign
              // project" collided with the stop toast's action, which does
              // something different (opens the whole editor) at a different
              // scope — a screen reader heard two identical controls.
              ariaLabel="Assign project to this entry"
              onAssign={onAssignProject}
            />
          </span>
        )}
        {entry.tags.map((tag) => (
          <Badge key={tag} variant="outline" className="h-4 gap-1 px-1 py-0 text-micro font-normal">
            <ColorDot color={tagColor(tag)} className="h-1.5 w-1.5" />
            {tag}
          </Badge>
        ))}
      </div>
    </div>
  );
}
