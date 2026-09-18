import { useMemo, useState } from "react";
import {
  ReportHeader,
  ReportRangeControl,
  type ExportFormat,
} from "@/components/reports/ReportHeader";
import { AiSummaryDialog } from "@/components/reports/AiSummaryDialog";
import { SummaryCards, SummaryMetricsMenu } from "@/components/reports/SummaryCards";
import { RoundingControl } from "@/components/reports/RoundingControl";
import { SavedReportsMenu } from "@/components/reports/SavedReportsMenu";
import type { ReportConfig } from "@/hooks/useSavedReports";
import { ReportFilterBar } from "@/components/reports/ReportFilterBar";
import {
  EMPTY_FILTERS,
  type ReportFilters,
} from "@/components/reports/report-filters";
import { ReportsSummarySection } from "@/components/reports/ReportsSummarySection";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { BarChart2 } from "lucide-react";
import {
  useReportSummary,
  useReportDetailed,
  useReportWeekly,
  useReportGrouped,
  type ReportSummary,
  type Rounding,
  type GroupDimension,
  type SubGroupDimension,
} from "@/hooks/useReports";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSummaryMetrics } from "@/hooks/useSummaryMetrics";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { useUIStore } from "@/stores/uiStore";
import { useUpdateSettings } from "@/hooks/useSettings";
import { getDateRangePresets } from "@/lib/dateUtils";
import { exportToCSV, exportToExcel } from "@/lib/exportUtils";

const { last7days } = getDateRangePresets();

// `key` is the summary breakdown a dimension reads; Person has none and always uses the grouped tree.
const GROUP_DIMS: {
  value: GroupDimension;
  label: string;
  key: keyof ReportSummary | null;
}[] = [
  { value: "project", label: "Project", key: "byProject" },
  { value: "client", label: "Client", key: "byClient" },
  { value: "task", label: "Task", key: "byTask" },
  { value: "tag", label: "Tag", key: "byTag" },
  { value: "user", label: "Person", key: null },
];

export function ReportsPage() {
  const [range, setRange] = useState({
    since: last7days.since,
    until: last7days.until,
    label: last7days.label,
  });
  const [filters, setFilters] = useState<ReportFilters>(EMPTY_FILTERS);
  const [groupDim, setGroupDim] = useState<GroupDimension>("project");
  const [subGroupDim, setSubGroupDim] = useState<SubGroupDimension>("none");
  const [hideAmounts, setHideAmounts] = useState(false);
  const { visible: visibleMetrics, toggle: toggleMetric } = useSummaryMetrics();
  // Person is an owner/admin view; the server would keep a member to their own hours anyway (D3).
  const { canManage } = useWorkspaceRole();
  const groupDims = canManage ? GROUP_DIMS : GROUP_DIMS.filter((d) => d.value !== "user");
  const effectiveGroup: GroupDimension = !canManage && groupDim === "user" ? "project" : groupDim;
  const effectiveSubGroup: SubGroupDimension =
    !canManage && subGroupDim === "user" ? "none" : subGroupDim;

  // Rounding is a persisted per-user preference (hydrated into the UI store).
  const roundMode = useUIStore((s) => s.roundMode);
  const roundMinutes = useUIStore((s) => s.roundMinutes);
  const setRoundingStore = useUIStore((s) => s.setRounding);
  const updateSettings = useUpdateSettings();
  const rounding: Rounding = { mode: roundMode, minutes: roundMinutes };
  const setRounding = (r: Rounding) => {
    setRoundingStore(r.mode, r.minutes); // optimistic; persisted below
    updateSettings.mutate({ roundMode: r.mode, roundMinutes: r.minutes });
  };

  // Debounce the free-text search so typing doesn't refetch on every keystroke.
  const debouncedSearch = useDebouncedValue(filters.search, 300);
  const queryFilters = useMemo(
    () => ({ ...filters, search: debouncedSearch }),
    [filters, debouncedSearch]
  );

  const { data: summary, isLoading } = useReportSummary(
    range.since,
    range.until,
    queryFilters,
    rounding
  );
  const { data: detailed = [], isLoading: detailedLoading } = useReportDetailed(
    range.since,
    range.until,
    queryFilters,
    rounding
  );
  const { data: weekly = [], isLoading: weeklyLoading } = useReportWeekly(
    range.since,
    range.until,
    queryFilters,
    rounding
  );
  const groupKey = GROUP_DIMS.find((d) => d.value === effectiveGroup)!.key;
  const showTree = effectiveSubGroup !== "none" || groupKey === null;
  const { data: grouped } = useReportGrouped(
    range.since,
    range.until,
    effectiveGroup,
    effectiveSubGroup,
    queryFilters,
    rounding,
    showTree
  );

  const handleExport = (format: ExportFormat) => {
    const entries = detailed;
    const name = `time-entries-${range.label.replace(/\s/g, "-")}`;
    const options = { includeAmount: !hideAmounts };
    if (format === "csv") exportToCSV(entries, name, options);
    else if (format === "excel") exportToExcel(entries, name, options);
    else window.print();
  };

  const currentConfig: ReportConfig = {
    range,
    filters,
    rounding,
    group: groupDim,
    subGroup: subGroupDim,
    hideAmounts,
  };

  const loadConfig = (cfg: ReportConfig) => {
    if (cfg.range?.since) setRange(cfg.range);
    if (cfg.filters) setFilters({ ...EMPTY_FILTERS, ...cfg.filters });
    if (cfg.rounding) setRounding(cfg.rounding);
    if (cfg.group) setGroupDim(cfg.group);
    if (cfg.subGroup) setSubGroupDim(cfg.subGroup);
    setHideAmounts(Boolean(cfg.hideAmounts));
  };

  const handleGroupChange = (dim: GroupDimension) => {
    setGroupDim(dim);
    if (subGroupDim === dim) setSubGroupDim("none");
  };

  return (
    <div className="space-y-4 p-6">
      {/* Row one is what you DO with a report; row two is what the report IS.
          See ReportRangeControl for why the range sits below rather than up
          here with the actions. */}
      <ReportHeader
        onExport={handleExport}
        actions={
          <>
            <SavedReportsMenu current={currentConfig} onLoad={loadConfig} />
            <AiSummaryDialog since={range.since} until={range.until} />
          </>
        }
      />

      <div className="flex flex-wrap items-start justify-between gap-2 print:hidden">
        <div className="flex flex-wrap items-center gap-2">
          <ReportRangeControl range={range} onRangeChange={setRange} />
          <ReportFilterBar filters={filters} onChange={setFilters} canFilterPeople={canManage} />
        </div>
        <div className="flex items-center gap-2">
          {/* For a report that goes to a client: hides money on screen, in CSV/Excel and in print. */}
          <div className="flex items-center gap-2">
            <Switch id="report-hide-amounts" checked={hideAmounts} onCheckedChange={setHideAmounts} />
            <Label htmlFor="report-hide-amounts" className="text-sm font-normal text-muted-foreground">
              Hide amounts
            </Label>
          </div>
          <RoundingControl value={rounding} onChange={setRounding} />
          <SummaryMetricsMenu visible={visibleMetrics} toggle={toggleMetric} />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20" />
            ))}
          </div>
          <Skeleton className="h-60" />
        </div>
      ) : summary ? (
        <>
          <SummaryCards
            totalSeconds={summary.totalSeconds}
            billableSeconds={summary.billableSeconds}
            billableAmount={summary.billableAmount}
            entryCount={summary.entryCount}
            avgSeconds={(() => {
              const sinceMs = range.since ? new Date(range.since).getTime() : NaN;
              const untilMs = range.until ? new Date(range.until).getTime() : NaN;
              const daysInRange =
                isNaN(sinceMs) || isNaN(untilMs)
                  ? 1
                  : Math.max(1, Math.round((untilMs - sinceMs) / 86400000) + 1);
              return summary.totalSeconds / daysInRange;
            })()}
            visible={visibleMetrics}
            hideAmount={hideAmounts}
          />

          <ReportsSummarySection
            summary={summary}
            since={range.since}
            until={range.until}
            groupDims={groupDims}
            effectiveGroup={effectiveGroup}
            effectiveSubGroup={effectiveSubGroup}
            onGroupChange={handleGroupChange}
            onSubGroupChange={setSubGroupDim}
            grouped={grouped}
            showTree={showTree}
            hideAmounts={hideAmounts}
            weekly={weekly}
            weeklyLoading={weeklyLoading}
            detailed={detailed}
            detailedLoading={detailedLoading}
          />
        </>
      ) : (
        <EmptyState
          icon={BarChart2}
          title="No data for this period"
          description="Try a different date range, or start tracking time"
        />
      )}
    </div>
  );
}
