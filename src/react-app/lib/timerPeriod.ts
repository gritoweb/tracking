import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfDay,
  endOfDay,
  isSameDay,
  format,
} from "date-fns";
import { resolveListRange, type ListRangeKey } from "@/lib/dateUtils";
import { DEFAULT_PROJECT_COLOR } from "@/components/ColorDot";
import type { LoggedSegment } from "@/components/timer/TimerWorkspaceHeader";
import type { TimeEntry } from "@shared/schemas";

type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/**
 * The visible period for TimerWorkspace's active view.
 *
 * The list view scopes by the user's chosen range (persisted); every other
 * view — including the list pane *inside* split, which must stay aligned with
 * the calendar beside it — scopes by the navigable week/month/day.
 */
export function resolveTimerPeriod(params: {
  isListView: boolean;
  isMonthView: boolean;
  isDayView: boolean;
  listRangeKey: ListRangeKey;
  listRangeSince: string | null;
  listRangeUntil: string | null;
  weekStartsOn: WeekStartsOn;
  today: Date;
  anchor: Date;
}): { since: Date; until: Date } {
  const { isListView, isMonthView, isDayView, listRangeKey, listRangeSince, listRangeUntil, weekStartsOn, today, anchor } = params;
  if (isListView) {
    const r = resolveListRange(listRangeKey, listRangeSince, listRangeUntil, weekStartsOn, today);
    return { since: r.since, until: r.until };
  }
  if (isMonthView) return { since: startOfMonth(anchor), until: endOfMonth(anchor) };
  if (isDayView) return { since: startOfDay(anchor), until: endOfDay(anchor) };
  return {
    since: startOfWeek(anchor, { weekStartsOn }),
    until: endOfWeek(anchor, { weekStartsOn }),
  };
}

/** Per-project totals for the "Logged" bar, largest first. */
export function summarizeLoggedSegments(entries: TimeEntry[]): {
  periodSeconds: number;
  segments: LoggedSegment[];
} {
  const byProject = new Map<string | null, LoggedSegment>();
  let total = 0;
  for (const e of entries) {
    const secs = e.duration ?? 0;
    if (secs <= 0) continue;
    total += secs;
    const seg = byProject.get(e.projectId);
    if (seg) seg.seconds += secs;
    else
      byProject.set(e.projectId, {
        projectId: e.projectId,
        projectName: e.projectName,
        color: e.projectColor ?? DEFAULT_PROJECT_COLOR,
        seconds: secs,
      });
  }
  return {
    periodSeconds: total,
    segments: [...byProject.values()].sort((a, b) => b.seconds - a.seconds),
  };
}

/**
 * Name the grid's current period if the list range picker can express it
 * ("This week"/"Last week"), otherwise keep the exact dates as a custom range.
 * Used when leaving a grid view for List, so the period follows the user.
 */
export function matchListRangeKey(
  since: Date,
  until: Date,
  weekStartsOn: WeekStartsOn,
  today: Date
): { key: ListRangeKey; since?: string; until?: string } {
  const wk = resolveListRange("thisWeek", null, null, weekStartsOn, today);
  const lastWk = resolveListRange("lastWeek", null, null, weekStartsOn, today);
  if (isSameDay(since, wk.since) && isSameDay(until, wk.until)) return { key: "thisWeek" };
  if (isSameDay(since, lastWk.since) && isSameDay(until, lastWk.until)) return { key: "lastWeek" };
  return { key: "custom", since: format(since, "yyyy-MM-dd"), until: format(until, "yyyy-MM-dd") };
}
