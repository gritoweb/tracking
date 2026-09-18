import { useMemo } from "react";
import { useLocation } from "react-router-dom";
import { useTimerStore } from "@/stores/timerStore";

/**
 * Suggestion chips follow the user's context: the reports page leads with
 * summaries, project/client/task pages with per-project breakdowns, and the
 * timer views with tracking gaps. A running timer swaps the "start a timer"
 * chip for a check-in on the current one.
 */
export function useContextualSuggestions(): string[] {
  const { pathname } = useLocation();
  const runningEntry = useTimerStore((s) => s.runningEntry);

  return useMemo(() => {
    const timerChip = runningEntry
      ? "How long has my timer been running?"
      : "Start a timer for my current meeting";
    if (pathname.startsWith("/reports")) {
      return [
        "Summarize my time this week",
        "How much have I billed today?",
        "What haven't I tracked yet?",
        timerChip,
      ];
    }
    if (/^\/(projects|clients|tasks)/.test(pathname)) {
      return [
        "Which projects got my time this week?",
        "What haven't I tracked yet?",
        timerChip,
        "What's next on my calendar?",
      ];
    }
    return [
      "What haven't I tracked yet?",
      "How much have I billed today?",
      timerChip,
      "What's next on my calendar?",
    ];
  }, [pathname, runningEntry]);
}
