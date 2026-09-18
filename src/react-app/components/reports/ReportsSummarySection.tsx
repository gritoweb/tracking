import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DailyBarChart } from "./DailyBarChart";
import { BreakdownCard } from "./BreakdownCard";
import { SummaryTree } from "./SummaryTree";
import { WeeklyBarChart } from "./WeeklyBarChart";
import { DetailedTable, type DetailedEntry } from "./DetailedTable";
import type {
  GroupedReport,
  GroupDimension,
  ReportSummary,
  SubGroupDimension,
  WeeklyData,
} from "@/hooks/useReports";

interface GroupDim {
  value: GroupDimension;
  label: string;
  key: keyof ReportSummary | null;
}

interface ReportsSummarySectionProps {
  summary: ReportSummary;
  since?: string;
  until?: string;
  groupDims: GroupDim[];
  effectiveGroup: GroupDimension;
  effectiveSubGroup: SubGroupDimension;
  onGroupChange: (dim: GroupDimension) => void;
  onSubGroupChange: (dim: SubGroupDimension) => void;
  grouped: GroupedReport | undefined;
  showTree: boolean;
  hideAmounts: boolean;
  weekly: WeeklyData[];
  weeklyLoading: boolean;
  detailed: DetailedEntry[];
  detailedLoading: boolean;
}

/** The three report tabs (Summary/Weekly/Detailed) — a pure view over already-fetched data. */
export function ReportsSummarySection({
  summary,
  since,
  until,
  groupDims,
  effectiveGroup,
  effectiveSubGroup,
  onGroupChange,
  onSubGroupChange,
  grouped,
  showTree,
  hideAmounts,
  weekly,
  weeklyLoading,
  detailed,
  detailedLoading,
}: ReportsSummarySectionProps) {
  const groupKey = groupDims.find((d) => d.value === effectiveGroup)?.key ?? null;

  // Group-by + sub-group-by controls, shared by the breakdown and tree views.
  const groupControls = (
    <div className="flex items-center gap-1.5">
      <Select
        value={effectiveGroup}
        onValueChange={(v) => onGroupChange(v as GroupDimension)}
      >
        <SelectTrigger className="h-7 w-24 text-xs" aria-label="Group by">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {groupDims.map((d) => (
            <SelectItem key={d.value} value={d.value}>
              {d.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">›</span>
      <Select
        value={effectiveSubGroup}
        onValueChange={(v) => onSubGroupChange(v as SubGroupDimension)}
      >
        <SelectTrigger className="h-7 w-32 text-xs" aria-label="Sub-group by">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No sub-group</SelectItem>
          {groupDims.filter((d) => d.value !== effectiveGroup).map((d) => (
            <SelectItem key={d.value} value={d.value}>
              {d.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Tabs defaultValue="summary">
      <TabsList className="print:hidden">
        <TabsTrigger value="summary">Summary</TabsTrigger>
        <TabsTrigger value="weekly">Weekly</TabsTrigger>
        <TabsTrigger value="detailed">
          Detailed
          {detailed.length > 0 && (
            <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-micro font-medium tabular-nums text-muted-foreground">
              {detailed.length}
            </span>
          )}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="summary" className="mt-4 space-y-4">
        {/* [&>*]:min-w-0 — grid items default to min-width:auto, so a card
            containing a chart inherits the chart's min-content width and
            refuses to shrink. Without this the Summary column measured
            441px inside a 342px track at 390px wide. */}
        <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
          <DailyBarChart data={summary.daily} since={since} until={until} />
          {showTree && grouped ? (
            <SummaryTree data={grouped} showAmount={!hideAmounts} header={groupControls} />
          ) : groupKey ? (
            <BreakdownCard
              title="Breakdown"
              rows={summary[groupKey] as ReportSummary["byProject"]}
              totalSeconds={summary.totalSeconds}
              showAmount={!hideAmounts}
              header={groupControls}
            />
          ) : (
            <Skeleton className="h-60" />
          )}
        </div>
      </TabsContent>

      <TabsContent value="weekly" className="mt-4">
        {weeklyLoading ? <Skeleton className="h-72" /> : <WeeklyBarChart data={weekly} />}
      </TabsContent>

      <TabsContent value="detailed" className="mt-4">
        {detailedLoading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        ) : (
          <DetailedTable entries={detailed} hideAmounts={hideAmounts} />
        )}
      </TabsContent>
    </Tabs>
  );
}
