import { formatDurationShort } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";
import type { PlanCell } from "./plannerTypes";

interface PlanPairProps {
  cell: PlanCell;
  alignRight?: boolean;
  strong?: boolean;
}

// Planned on top (editable), actual beneath; warned only when over an actual
// plan — being on/under plan is normal, not a state to celebrate or punish.
//
// The `planned > 0` guard is the whole point: without it every tracked cell
// on a fresh Planner rendered amber, because `actual > 0 > planned = 0` reads
// as "over plan". Day one of the Planner was a full grid of warning colour
// for the crime of having worked. You can't be over a plan you never made.
//
// Which of the two lines is loud depends on which one has something to say.
// The plan line is on top because it is the edit target, but with no plan
// entered — the state of every new user, and of any week nobody pre-planned —
// the top line was an em-dash rendered at the dominant weight while the real
// tracked hours sat beneath it smaller and dimmer. A grid full of tracked
// time read as empty, and the first-run impression of the feature was that
// nothing had recorded.
//
// So an absent plan de-emphasises to a placeholder and the tracked figure
// takes the weight. Nothing moves: the top line stays the click target, and
// the row keeps one shape whether or not it is planned.
export function PlanPair({ cell, alignRight, strong }: PlanPairProps) {
  const unplanned = cell.planned === 0 && cell.actual > 0;
  return (
    <span className={cn("flex flex-col leading-tight", alignRight ? "items-end" : "items-center")}>
      <span
        className={cn(
          "tabular-nums",
          unplanned
            ? "text-micro font-normal text-muted-foreground/60"
            : strong
              ? "font-semibold"
              : "font-medium"
        )}
      >
        {cell.planned > 0 ? formatDurationShort(cell.planned) : "–"}
      </span>
      {(cell.planned > 0 || cell.actual > 0) && (
        <span
          className={cn(
            "tabular-nums",
            unplanned ? cn("text-foreground", strong ? "font-semibold" : "font-medium") : "text-micro",
            !unplanned &&
              (cell.planned > 0 && cell.actual > cell.planned ? "text-warning-ink" : "text-muted-foreground")
          )}
        >
          {cell.actual > 0 ? formatDurationShort(cell.actual) : "–"}
        </span>
      )}
    </span>
  );
}
