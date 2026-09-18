import { useState } from "react";
import { CalendarClock, Check, ChevronLeft, Repeat, SquareDashed, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ProjectPicker } from "@/components/pickers/ProjectPicker";
import { BillableToggle } from "@/components/pickers/BillableToggle";
import { formatDurationShort, formatEntryTime } from "@/lib/dateUtils";
import type { DraftEntry, DraftSource } from "@shared/schemas";

const SOURCE_ICON: Record<DraftSource, typeof CalendarClock> = {
  calendar: CalendarClock,
  gap: SquareDashed,
  pattern: Repeat,
};

const SOURCE_LABEL: Record<DraftSource, string> = {
  calendar: "From your calendar",
  gap: "Unaccounted time",
  pattern: "Weekly habit",
};

/** Nudge a draft's length without opening a time picker. */
const ADJUST_STEPS = [-30, -15, 15, 30];

interface DraftCardProps {
  draft: DraftEntry;
  timeFormat: "24h" | "12h";
  renaming: boolean;
  onStartRename: () => void;
  onRename: (description: string) => void;
  onCancelRename: () => void;
  onProject: (projectId: string | null) => void;
  onBillable: (billable: boolean) => void;
  onAdjust: (deltaMinutes: number) => void;
  onDiscard: () => void;
  onKeep: () => void;
  onBack?: () => void;
}

/** One draft's review card — keep it, fix it, or throw it away. Pure view. */
export function DraftCard({
  draft,
  timeFormat,
  renaming,
  onStartRename,
  onRename,
  onCancelRename,
  onProject,
  onBillable,
  onAdjust,
  onDiscard,
  onKeep,
  onBack,
}: DraftCardProps) {
  // Seeded once per card — the card is keyed by draft id, so switching cards
  // remounts it rather than syncing state through an effect.
  const [draftText, setDraftText] = useState(draft.description);

  const SourceIcon = SOURCE_ICON[draft.source];

  return (
    <div className="space-y-4 py-2">
      <div className="rounded-lg bg-card p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <SourceIcon className="h-3.5 w-3.5" />
          <span>{SOURCE_LABEL[draft.source]}</span>
          {draft.confidence === "low" && (
            <Badge variant="outline" className="text-micro">
              Low confidence
            </Badge>
          )}
        </div>

        {renaming ? (
          <div className="mt-2 flex items-center gap-2">
            <Input
              autoFocus
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onRename(draftText);
                if (e.key === "Escape") onCancelRename();
              }}
              placeholder="What was this?"
              aria-label="Entry description"
              className="h-9"
            />
            <Button size="sm" onClick={() => onRename(draftText)}>
              Save
            </Button>
          </div>
        ) : (
          // Inline text trigger spanning the card's full width, not a Button shape.
          <button
            type="button"
            onClick={onStartRename}
            className="mt-2 block w-full rounded text-left text-sm font-medium transition-colors duration-fast ease-out-quart hover:text-muted-foreground"
            title="Rename this entry"
          >
            {draft.description || (
              <span className="text-muted-foreground italic">Click to describe this time</span>
            )}
          </button>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono tabular-nums">
            {formatEntryTime(draft.start, timeFormat)}–{formatEntryTime(draft.stop, timeFormat)}
          </span>
          <span aria-hidden>·</span>
          <span className="font-semibold tabular-nums text-foreground">
            {formatDurationShort(draft.duration)}
          </span>
        </div>

        {/* Why this was proposed. A proposal the user can't account for is one
            they can't judge — and an unjudgeable proposal gets rubber-stamped. */}
        {draft.reason && <p className="mt-2 text-xs text-muted-foreground">{draft.reason}</p>}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <ProjectPicker value={draft.projectId} onChange={onProject} compact />
          <BillableToggle value={draft.billable} onChange={onBillable} />
          <div className="ml-auto flex items-center gap-1">
            {ADJUST_STEPS.map((step) => (
              <Button
                key={step}
                variant="outline"
                size="sm"
                className="h-7 px-2 font-mono text-micro tabular-nums"
                onClick={() => onAdjust(step)}
                aria-label={`${step > 0 ? "Add" : "Remove"} ${Math.abs(step)} minutes`}
              >
                {step > 0 ? `+${step}` : step}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ChevronLeft className="h-4 w-4" />
              Back
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={onDiscard} className="text-muted-foreground">
            <Trash2 className="h-4 w-4" />
            Discard
          </Button>
        </div>
        <Button size="sm" onClick={onKeep} className="gap-1.5">
          <Check className="h-4 w-4" />
          Keep
        </Button>
      </div>
    </div>
  );
}
