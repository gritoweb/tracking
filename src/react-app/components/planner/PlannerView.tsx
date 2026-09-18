import { useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { toast } from "sonner";
import { useEntriesRange } from "@/hooks/useEntries";
import {
  useAllocationsRange,
  useUpsertAllocation,
  useBulkUpsertAllocations,
} from "@/hooks/usePlanner";
import { api } from "@/lib/api-client";
import { parseTimeInput } from "@/lib/dateUtils";
import { AddTimesheetRowDialog } from "@/components/week-grid/AddTimesheetRowDialog";
import { PlannerImportDialog } from "./PlannerImportDialog";
import { PlannerGrid } from "./PlannerGrid";
import { PlannerToolbar } from "./PlannerToolbar";
import { rowKeyOf, type PlanCell, type PlannerRowMeta } from "./plannerTypes";

interface PlannerViewProps {
  weekStart: Date;
}

// The Planner grid: same project/task rows × day columns as the timesheet, but
// cells hold *planned* seconds (editable, per-user) with the week's actual
// tracked time beneath for an at-a-glance plan-vs-actual. Rows appear for
// anything planned OR tracked this week, so untracked plans and unplanned work
// are both visible.
export function PlannerView({ weekStart }: PlannerViewProps) {
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const dayKeys = useMemo(() => days.map((d) => format(d, "yyyy-MM-dd")), [days]);
  const sinceDate = dayKeys[0];
  const untilDate = format(weekEnd, "yyyy-MM-dd");

  const {
    data: allocations = [],
    isLoading,
    isError,
    refetch,
  } = useAllocationsRange(sinceDate, untilDate);
  // Same key the TimerWorkspace header already fetches — deduped, not a second fetch.
  const { data: entries = [] } = useEntriesRange(weekStart.toISOString(), weekEnd.toISOString());

  const upsert = useUpsertAllocation();
  const bulkUpsert = useBulkUpsertAllocations();

  const [extraRows, setExtraRows] = useState<PlannerRowMeta[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [editing, setEditing] = useState<{ row: string; day: number } | null>(null);
  const [draft, setDraft] = useState("");

  const { rows, cells } = useMemo(() => {
    const rowMap = new Map<string, PlannerRowMeta>();
    const cellMap = new Map<string, PlanCell[]>();

    const ensureRow = (m: PlannerRowMeta) => {
      if (!rowMap.has(m.key)) {
        rowMap.set(m.key, m);
        cellMap.set(
          m.key,
          Array.from({ length: 7 }, () => ({ planned: 0, actual: 0 }))
        );
      }
    };

    for (const a of allocations) {
      const key = rowKeyOf(a.projectId, a.taskId);
      ensureRow({
        key,
        projectId: a.projectId,
        taskId: a.taskId,
        projectName: a.projectName,
        projectColor: a.projectColor,
        taskName: a.taskName,
      });
      // Allocations are date-keyed local strings — match by equality, no Date math.
      const dayIndex = dayKeys.indexOf(a.date);
      if (dayIndex === -1) continue;
      cellMap.get(key)![dayIndex].planned += a.plannedSeconds;
    }

    for (const e of entries) {
      const key = rowKeyOf(e.projectId, e.taskId);
      ensureRow({
        key,
        projectId: e.projectId,
        taskId: e.taskId,
        projectName: e.projectName,
        projectColor: e.projectColor,
        taskName: e.taskName ?? null,
      });
      const start = new Date(e.start);
      const dayIndex = Math.floor(
        (new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime() -
          new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate()).getTime()) /
          86_400_000
      );
      if (dayIndex < 0 || dayIndex > 6) continue;
      cellMap.get(key)![dayIndex].actual += e.duration ?? 0;
    }

    for (const r of extraRows) ensureRow(r);

    const rowsArr = [...rowMap.values()].sort((a, b) => {
      const pa = a.projectName ?? "￿";
      const pb = b.projectName ?? "￿";
      return pa.localeCompare(pb) || (a.taskName ?? "").localeCompare(b.taskName ?? "");
    });
    return { rows: rowsArr, cells: cellMap };
  }, [allocations, entries, extraRows, weekStart, dayKeys]);

  const dayTotals = useMemo(() => {
    const totals: PlanCell[] = Array.from({ length: 7 }, () => ({ planned: 0, actual: 0 }));
    for (const list of cells.values())
      list.forEach((c, i) => {
        totals[i].planned += c.planned;
        totals[i].actual += c.actual;
      });
    return totals;
  }, [cells]);
  const grandTotal = dayTotals.reduce(
    (acc, t) => ({ planned: acc.planned + t.planned, actual: acc.actual + t.actual }),
    { planned: 0, actual: 0 }
  );

  const handleStartEdit = (row: PlannerRowMeta, dayIndex: number) =>
    setEditing({ row: row.key, day: dayIndex });

  const commitCell = (row: PlannerRowMeta, dayIndex: number) => {
    const cell = cells.get(row.key)![dayIndex];
    setEditing(null);
    if (!row.projectId) return; // "Without project" rows can't be planned
    const parsed = parseTimeInput(draft.trim());
    const seconds = draft.trim() === "" ? 0 : parsed;
    if (seconds === null) return; // invalid input → ignore
    if (seconds === cell.planned) return;

    upsert.mutate({
      projectId: row.projectId,
      taskId: row.taskId,
      date: dayKeys[dayIndex],
      plannedSeconds: seconds,
      projectName: row.projectName,
      projectColor: row.projectColor,
      taskName: row.taskName,
    });
  };

  const handleCopyLastWeek = async () => {
    setCopying(true);
    try {
      const prevSince = format(addDays(weekStart, -7), "yyyy-MM-dd");
      const prev = await api.planner.list({
        since: prevSince,
        until: sinceDate,
      });
      if (prev.length === 0) {
        toast.info("No plan to copy from last week");
        return;
      }
      // Snapshot this week's cells before overwriting so Undo restores what was
      // actually there (including blanks), not just zeroes.
      const snapshot = new Map<string, number>();
      for (const a of allocations)
        snapshot.set(`${a.projectId}__${a.taskId ?? ""}__${a.date}`, a.plannedSeconds);

      const copied = prev.map((a) => ({
        projectId: a.projectId,
        taskId: a.taskId,
        date: format(addDays(new Date(`${a.date}T00:00:00`), 7), "yyyy-MM-dd"),
        plannedSeconds: a.plannedSeconds,
      }));
      await bulkUpsert.mutateAsync({ allocations: copied });
      toast.success(`Copied ${prev.length} planned ${prev.length === 1 ? "cell" : "cells"} from last week`, {
        action: {
          label: "Undo",
          onClick: () =>
            bulkUpsert.mutate({
              allocations: copied.map((a) => ({
                ...a,
                plannedSeconds: snapshot.get(`${a.projectId}__${a.taskId ?? ""}__${a.date}`) ?? 0,
              })),
            }),
        },
      });
    } catch {
      toast.error("Couldn't copy last week's plan");
    } finally {
      setCopying(false);
    }
  };

  const toolbar = (
    <PlannerToolbar
      onAddRow={() => setAddOpen(true)}
      onCopyLastWeek={handleCopyLastWeek}
      onImport={() => setImportOpen(true)}
      copying={copying}
    />
  );

  return (
    <div className="flex h-full flex-col overflow-auto">
      <PlannerGrid
        days={days}
        rows={rows}
        cells={cells}
        dayTotals={dayTotals}
        grandTotal={grandTotal}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        emptyStateActions={toolbar}
        editing={editing}
        draft={draft}
        onDraftChange={setDraft}
        onStartEdit={handleStartEdit}
        onCommitCell={commitCell}
        onCancelEdit={() => setEditing(null)}
      />

      {/* The empty state owns the actions while the body is empty — rendering
          them here as well put the same labels twice on one screen, 84px
          apart, which reads as a rendering bug. One rule, four screens. */}
      {rows.length > 0 && <div className="flex flex-wrap items-center gap-2 p-3">{toolbar}</div>}

      <AddTimesheetRowDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(row) => {
          if (!row.projectId) {
            toast.info("Pick a project to plan hours against");
            return;
          }
          setExtraRows((prev) =>
            prev.some((r) => r.key === row.key) ? prev : [...prev, row]
          );
        }}
      />

      <PlannerImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        weekDayKeys={dayKeys}
      />
    </div>
  );
}
