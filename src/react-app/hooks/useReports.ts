import { useQuery } from "@tanstack/react-query";
import { api, type ReportParams } from "@/lib/api-client";
import type { ReportFilters } from "@/components/reports/report-filters";
import type {
  ReportBreakdownRow,
  ReportDailyRow,
  ReportSummary,
  ReportWeeklyDay,
  ReportWeekly,
  ReportGroupRow,
  GroupedReport,
  GroupDimension,
  SubGroupDimension,
} from "@shared/schemas";

// Re-exported under the names components already import (canonical shape now lives in @shared/schemas).
export type {
  ReportBreakdownRow as BreakdownRow,
  ReportSummary,
  ReportWeeklyDay as WeeklyDay,
  ReportWeekly as WeeklyData,
  ReportGroupRow as GroupRow,
  GroupedReport,
  GroupDimension,
  SubGroupDimension,
};
// Kept for symmetry with the others, though nothing outside this file reads it directly.
export type DailyData = ReportDailyRow;

export type RoundMode = "off" | "nearest" | "up" | "down";

export interface Rounding {
  mode: RoundMode;
  minutes: number;
}

export const DEFAULT_ROUNDING: Rounding = { mode: "off", minutes: 15 };

// Turn the filters + rounding into comma-joined query params (undefined when
// empty) plus a stable key fragment so TanStack Query caches per combination.
function queryParams(
  filters?: ReportFilters,
  rounding?: Rounding
): { params: Omit<ReportParams, "since" | "until">; key: string } {
  const join = (a?: string[]) => (a && a.length ? a.join(",") : undefined);
  const rounded = rounding && rounding.mode !== "off" && rounding.minutes > 0;
  const params = {
    clientIds: join(filters?.clientIds),
    projectIds: join(filters?.projectIds),
    taskIds: join(filters?.taskIds),
    tagIds: join(filters?.tagIds),
    userIds: join(filters?.userIds),
    billable:
      filters?.billable && filters.billable !== "all" ? filters.billable : undefined,
    search: filters?.search?.trim() || undefined,
    roundMode: rounded ? rounding!.mode : undefined,
    roundMinutes: rounded ? String(rounding!.minutes) : undefined,
  };
  return { params, key: JSON.stringify(params) };
}

export function useReportSummary(
  since: string,
  until: string,
  filters?: ReportFilters,
  rounding?: Rounding
) {
  const { params, key } = queryParams(filters, rounding);
  return useQuery({
    queryKey: ["reports", "summary", since, until, key],
    queryFn: () => api.reports.summary({ since, until, groupBy: "day", ...params }),
    enabled: Boolean(since && until),
  });
}

export function useReportDetailed(
  since: string,
  until: string,
  filters?: ReportFilters,
  rounding?: Rounding
) {
  const { params, key } = queryParams(filters, rounding);
  return useQuery({
    queryKey: ["reports", "detailed", since, until, key],
    queryFn: () => api.reports.detailed({ since, until, ...params }),
    enabled: Boolean(since && until),
  });
}

export function useReportWeekly(
  since: string,
  until: string,
  filters?: ReportFilters,
  rounding?: Rounding
) {
  const { params, key } = queryParams(filters, rounding);
  return useQuery({
    queryKey: ["reports", "weekly", since, until, key],
    queryFn: () => api.reports.weekly({ since, until, ...params }),
    enabled: Boolean(since && until),
  });
}

export function useReportGrouped(
  since: string,
  until: string,
  group: GroupDimension,
  subGroup: SubGroupDimension,
  filters?: ReportFilters,
  rounding?: Rounding,
  enabled = true
) {
  const { params, key } = queryParams(filters, rounding);
  return useQuery({
    queryKey: ["reports", "grouped", since, until, group, subGroup, key],
    queryFn: () => api.reports.grouped({ since, until, group, subGroup, ...params }),
    enabled: Boolean(since && until) && enabled,
  });
}
