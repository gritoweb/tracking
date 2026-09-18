import { Check, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { formatDurationShort } from "@/lib/dateUtils";

interface DraftTotalCardProps {
  confirmedSeconds: number;
  draftSeconds: number;
  draftCount: number;
  totalInput: string;
  onTotalInputChange: (value: string) => void;
  willScale: boolean;
  draftTarget: number;
  onBack: () => void;
  onConfirm: () => void;
  confirming: boolean;
  confirmDisabled: boolean;
}

/** The review's last card: the day's reported total, optionally rescaling the batch. Pure view. */
export function DraftTotalCard({
  confirmedSeconds,
  draftSeconds,
  draftCount,
  totalInput,
  onTotalInputChange,
  willScale,
  draftTarget,
  onBack,
  onConfirm,
  confirming,
  confirmDisabled,
}: DraftTotalCardProps) {
  return (
    <div className="space-y-4 py-2">
      <div className="rounded-lg bg-card p-4">
        <p className="text-sm font-medium">How much time should we report?</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {confirmedSeconds > 0 && <>{formatDurationShort(confirmedSeconds)} already tracked · </>}
          {formatDurationShort(draftSeconds)} drafted
        </p>
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={totalInput}
            onChange={(e) => onTotalInputChange(e.target.value)}
            aria-label="Total time to report for the day"
            className="h-9 w-28 font-mono tabular-nums"
          />
          <span className="text-xs text-muted-foreground">for the whole day</span>
        </div>
        {/* Say what the number will do before it does it. Silent rescaling of
            five entries is exactly the kind of edit someone needs to see coming. */}
        {willScale && (
          <p className="mt-3 text-xs text-warning-ink">
            The {draftCount} drafted {draftCount === 1 ? "entry" : "entries"} will be scaled to fit —{" "}
            {formatDurationShort(draftSeconds)} → {formatDurationShort(draftTarget)}.
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <Button size="sm" onClick={onConfirm} disabled={confirming || confirmDisabled} className="gap-1.5">
          {confirming ? <Spinner size="sm" /> : <Check className="h-4 w-4" />}
          Add {draftCount} to timesheet
        </Button>
      </div>
    </div>
  );
}
