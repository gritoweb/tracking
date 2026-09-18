import { useMemo, useState } from "react";
import { CalendarPlus } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DraftCard } from "./DraftCard";
import { DraftTotalCard } from "./DraftTotalCard";
import {
  useDrafts,
  useUpdateDraft,
  useDiscardDraft,
  useConfirmDrafts,
} from "@/hooks/useDrafts";
import { useEntriesRange } from "@/hooks/useEntries";
import { useCalendarStatus } from "@/hooks/useCalendarSync";
import { useUIStore } from "@/stores/uiStore";
import { formatPlainDate, parseTimeInput, formatTimeInput } from "@/lib/dateUtils";
import type { DraftEntry } from "@shared/schemas";

interface DraftReviewDialogProps {
  open: boolean;
  /** Local 'YYYY-MM-DD' the review covers. */
  localDate: string;
  onClose: () => void;
}

/**
 * Review: confirm a drafted day one card at a time.
 *
 * The shape is deliberate. A drafted day is a list of claims about what someone
 * did, and a list is the wrong way to check claims — the eye slides over it and
 * the whole day gets approved in one click, which is how a plausible-but-wrong
 * entry ends up on an invoice. One card at a time forces a decision per entry
 * and makes each decision cheap: keep, fix the project, rename it, nudge the
 * minutes, or throw it away.
 *
 * The last card is the one that matters most: the day's *total*. Individually
 * plausible entries can still add up to a number the user won't stand behind,
 * and correcting that by hand-editing five entries is work nobody does. Setting
 * the total scales the batch proportionally instead.
 *
 * Controller: owns hooks/mutations/state; DraftCard/DraftTotalCard are pure views.
 */
export function DraftReviewDialog({ open, localDate, onClose }: DraftReviewDialogProps) {
  const { data: drafts = [], isLoading } = useDrafts(localDate, open);
  const updateDraft = useUpdateDraft(localDate);
  const discardDraft = useDiscardDraft(localDate);
  const confirmDrafts = useConfirmDrafts(localDate);
  const timeFormat = useUIStore((s) => s.timeFormat);

  // Time already on the timesheet for this day — the total card reports the
  // whole day, not just the part being confirmed.
  const dayStart = useMemo(() => new Date(`${localDate}T00:00:00`), [localDate]);
  const dayEnd = useMemo(() => new Date(dayStart.getTime() + 86_400_000), [dayStart]);
  const { data: dayEntries = [] } = useEntriesRange(dayStart.toISOString(), dayEnd.toISOString(), {
    enabled: open,
  });
  const confirmedSeconds = dayEntries
    .filter((e) => e.stop)
    .reduce((sum, e) => sum + (e.duration ?? 0), 0);

  /**
   * Drafting works without a calendar — it still finds uncovered stretches and
   * weekday habits — but it is missing its strongest signal, and the user has no
   * way to know that from a short list of proposals. Said once, at the bottom of
   * review, and only when nothing is connected.
   */
  const { data: calendarProviders = [] } = useCalendarStatus();
  const noCalendarConnected =
    calendarProviders.length > 0 && !calendarProviders.some((p) => p.connected);

  const [index, setIndex] = useState(0);
  const [renaming, setRenaming] = useState<string | null>(null);
  // Only the user's OWN number is state. Until they type one, the field shows
  // the running total derived from the cards — so nudging a card's minutes moves
  // it, without an effect syncing two sources of truth.
  const [typedTotal, setTypedTotal] = useState<string | null>(null);

  const draftSeconds = drafts.reduce((sum, d) => sum + d.duration, 0);
  const proposedTotal = confirmedSeconds + draftSeconds;
  const totalInput = typedTotal ?? formatTimeInput(proposedTotal);

  const onTotalCard = index >= drafts.length;
  const current = drafts[index];

  const goNext = () => setIndex((i) => Math.min(i + 1, drafts.length));
  const goBack = () => setIndex((i) => Math.max(0, i - 1));

  const handleDiscard = (draft: DraftEntry) => {
    discardDraft.mutate(draft.id);
    // The list shortens under us, so staying put lands on the next card.
    setIndex((i) => Math.min(i, Math.max(0, drafts.length - 2)));
  };

  const adjustMinutes = (draft: DraftEntry, deltaMinutes: number) => {
    const nextDuration = Math.max(60, draft.duration + deltaMinutes * 60);
    updateDraft.mutate({
      id: draft.id,
      data: {
        stop: new Date(new Date(draft.start).getTime() + nextDuration * 1000).toISOString(),
      },
    });
  };

  const parsedTotal = parseTimeInput(totalInput);
  const targetDayTotal = parsedTotal ?? proposedTotal;
  // The API scales the drafts, so translate a day total into a drafts total.
  // Never below a minute per draft: scaling an entry out of existence is a
  // delete, and a delete should be an explicit act.
  const draftTarget = Math.max(drafts.length * 60, targetDayTotal - confirmedSeconds);
  const willScale = drafts.length > 0 && Math.abs(draftTarget - draftSeconds) > 30;

  // Every entry needs a project (D3): confirming waits until each proposal has one.
  const missingProject = drafts.some((d) => !d.projectId);
  const handleConfirm = () => {
    if (!drafts.length || missingProject) return;
    confirmDrafts.mutate(
      {
        ids: drafts.map((d) => d.id),
        reportedTotalSeconds: willScale ? draftTarget : null,
      },
      { onSuccess: onClose }
    );
  };

  const progress = drafts.length ? (Math.min(index, drafts.length) / drafts.length) * 100 : 100;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review {formatPlainDate(localDate, "EEEE, MMM d")}</DialogTitle>
          <DialogDescription>
            {drafts.length === 0
              ? "Nothing is waiting for review on this day."
              : onTotalCard
                ? "One last look at the day's total."
                : `Entry ${index + 1} of ${drafts.length} — keep it, fix it, or throw it away.`}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner size="lg" className="text-muted-foreground" />
          </div>
        ) : drafts.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Draft the day from the Timer header to see proposals here.
          </div>
        ) : (
          <>
            <Progress value={progress} className="h-1" aria-label="Review progress" />

            {onTotalCard ? (
              <DraftTotalCard
                confirmedSeconds={confirmedSeconds}
                draftSeconds={draftSeconds}
                draftCount={drafts.length}
                totalInput={totalInput}
                onTotalInputChange={setTypedTotal}
                willScale={willScale}
                draftTarget={draftTarget}
                onBack={goBack}
                onConfirm={handleConfirm}
                confirming={confirmDrafts.isPending}
                confirmDisabled={missingProject}
              />
            ) : current ? (
              <DraftCard
                key={current.id}
                draft={current}
                timeFormat={timeFormat}
                renaming={renaming === current.id}
                onStartRename={() => setRenaming(current.id)}
                onRename={(description) => {
                  updateDraft.mutate({ id: current.id, data: { description } });
                  setRenaming(null);
                }}
                onCancelRename={() => setRenaming(null)}
                onProject={(projectId) => updateDraft.mutate({ id: current.id, data: { projectId } })}
                onBillable={(billable) => updateDraft.mutate({ id: current.id, data: { billable } })}
                onAdjust={(delta) => adjustMinutes(current, delta)}
                onDiscard={() => handleDiscard(current)}
                onKeep={goNext}
                onBack={index > 0 ? goBack : undefined}
              />
            ) : null}

            {noCalendarConnected && (
              <p className="flex items-start gap-2 border-t pt-3 text-xs leading-normal text-muted-foreground">
                <CalendarPlus className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  These come from gaps in your day and your weekly habits. Connect a calendar in{" "}
                  <span className="font-medium">Settings</span> and meetings you didn&apos;t track get
                  drafted too.
                </span>
              </p>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
