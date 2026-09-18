import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { formatDurationShort } from "@/lib/dateUtils";
import type { LoggedSegment } from "./TimerWorkspaceHeader";

interface TimerLoggedBarProps {
  periodSummary: string;
  totalSeconds: number;
  segments: LoggedSegment[];
}

/**
 * A proportion bar, not a progress bar: the segments are projects and they
 * always sum to the full width, so there is no unfilled remainder to misread
 * as "not done yet". Pure view.
 */
export function TimerLoggedBar({ periodSummary, totalSeconds, segments }: TimerLoggedBarProps) {
  return (
    <div className="flex items-center gap-3 px-4 pb-2">
      {/* Name the period the number covers. "Logged" alone meant a different
          span in each view, so the total appeared to contradict itself when
          you switched tabs. */}
      <span className="whitespace-nowrap text-xs font-medium text-muted-foreground">
        Logged <span className="text-foreground">{periodSummary}</span>
      </span>
      {/* At 0m the bar was a full-width empty grey track — a chart of nothing.
          Collapse to a hairline rule so the row keeps its rhythm without
          implying there's a value to read.

          It was, however, mute. The breakdown lived entirely in per-segment
          hover tooltips inside non-focusable divs, so a screen-reader user
          got a decorative strip and nothing else. One label carries the same
          sentence the tooltips do. */}
      <div
        role="img"
        aria-label={
          totalSeconds > 0
            ? `Logged ${periodSummary}: ${formatDurationShort(totalSeconds)}. ` +
              segments
                .map(
                  (seg) =>
                    `${seg.projectName ?? "No project"} ${formatDurationShort(seg.seconds)}, ` +
                    `${Math.round((seg.seconds / totalSeconds) * 100)}%`
                )
                .join("; ")
            : `Nothing logged ${periodSummary}`
        }
        className={cn(
          "flex flex-1 overflow-hidden rounded-full bg-muted transition-all duration-fast ease-out-quart",
          totalSeconds > 0 ? "h-2" : "h-px"
        )}
      >
        {totalSeconds > 0 &&
          segments.map((seg) => (
            <Tooltip key={seg.projectId ?? "none"}>
              <TooltipTrigger asChild>
                <div
                  aria-hidden
                  className="h-full first:rounded-l-full last:rounded-r-full"
                  style={{
                    width: `${(seg.seconds / totalSeconds) * 100}%`,
                    backgroundColor: seg.color,
                  }}
                />
              </TooltipTrigger>
              <TooltipContent>
                {seg.projectName ?? "No project"}
                <span className="ml-1.5 text-background/60">
                  {formatDurationShort(seg.seconds)} · {Math.round((seg.seconds / totalSeconds) * 100)}%
                </span>
              </TooltipContent>
            </Tooltip>
          ))}
      </div>
      <span className="text-xs font-semibold tabular-nums">{formatDurationShort(totalSeconds)}</span>
      <Link
        to="/reports"
        className="hit-area flex items-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors duration-fast ease-out-quart hover:text-foreground"
      >
        View reports
        <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
