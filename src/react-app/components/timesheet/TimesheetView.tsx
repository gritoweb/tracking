import { useMemo, useState } from "react";
import { addDays } from "date-fns";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  useEntriesRange,
  useCreateEntry,
  useUpdateEntry,
  useDeleteEntry,
} from "@/hooks/useEntries";
import { api } from "@/lib/api-client";
import { toastApiError } from "@/lib/toastApiError";
import { parseTimeInput } from "@/lib/dateUtils";
import { toCreatePayload } from "@/lib/entryUtils";
import { buildTimesheetGrid, timesheetDayTotals, type TimesheetRowMeta } from "@/lib/timesheetGrid";
import { AddTimesheetRowDialog } from "@/components/week-grid/AddTimesheetRowDialog";
import { TimesheetGridBody } from "./TimesheetGridBody";
import { DEFAULT_ENTRY_BILLABLE } from "@shared/billable";

interface TimesheetViewProps {
  weekStart: Date; // Monday
}

const DEFAULT_START_HOUR = 9; // where a freshly-typed cell entry begins

// A weekly timesheet grid: project/task rows × day columns. Typing a duration
// into a cell creates/updates/deletes the underlying time entry for that
// project+task on that day. Cells backed by more than one entry are read-only
// (ambiguous to edit) — edit those in the list or calendar view.
export function TimesheetView({ weekStart }: TimesheetViewProps) {
  const queryClient = useQueryClient();
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);

  const {
    data: entries = [],
    isLoading,
    // Previously undestructured — a failed fetch rendered as an ordinary empty
    // grid, indistinguishable from a week with nothing tracked.
    isError,
    refetch,
  } = useEntriesRange(weekStart.toISOString(), weekEnd.toISOString());

  const createEntry = useCreateEntry();
  const updateEntry = useUpdateEntry();
  const deleteEntry = useDeleteEntry();

  // Manually-added empty rows (project/task combos with no entries yet).
  const [extraRows, setExtraRows] = useState<TimesheetRowMeta[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [copying, setCopying] = useState(false);
  const [editing, setEditing] = useState<{ row: string; day: number } | null>(null);
  const [draft, setDraft] = useState("");

  const { rows, cells } = useMemo(
    () => buildTimesheetGrid(entries, extraRows, weekStart),
    [entries, extraRows, weekStart]
  );
  const dayTotals = useMemo(() => timesheetDayTotals(cells), [cells]);
  const grandTotal = dayTotals.reduce((s, n) => s + n, 0);

  const commitCell = (row: TimesheetRowMeta, dayIndex: number) => {
    const cell = cells.get(row.key)![dayIndex];
    setEditing(null);
    const parsed = parseTimeInput(draft.trim());
    // Invalid input → ignore. Empty or 0 → clear (delete single entry).
    const seconds = draft.trim() === "" ? 0 : parsed;
    if (seconds === null) return;
    if (cell.entries.length > 1) return; // read-only aggregate

    if (cell.entries.length === 1) {
      const entry = cell.entries[0];
      if (seconds <= 0) {
        // Clearing a cell deletes real tracked time. The app's convention for
        // destructive actions is undo rather than a confirm dialog (see
        // EntryRow/EntryList delete), so match it instead of adding a modal to
        // the fastest reconstruction path.
        const payload = toCreatePayload(entry);
        deleteEntry.mutate(entry.id);
        toast.success("Entry cleared", {
          action: payload ? { label: "Undo", onClick: () => createEntry.mutate(payload) } : undefined,
        });
      } else {
        const start = new Date(entry.start);
        const stop = new Date(start.getTime() + seconds * 1000);
        updateEntry.mutate({ id: entry.id, data: { stop: stop.toISOString() } });
      }
      return;
    }

    // No entry yet → create one starting at the default hour on that day.
    if (seconds > 0) {
      // Every entry needs a project (D3); a row without one can't take new time.
      if (!row.projectId) {
        toast.error("Pick a project for this row before logging time on it");
        return;
      }
      const projectId = row.projectId;
      const day = days[dayIndex];
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), DEFAULT_START_HOUR, 0, 0);
      const stop = new Date(start.getTime() + seconds * 1000);
      createEntry.mutate({
        description: "",
        projectId,
        taskId: row.taskId,
        start: start.toISOString(),
        stop: stop.toISOString(),
        billable: DEFAULT_ENTRY_BILLABLE,
        tags: [],
      });
    }
  };

  const handleCopyLastWeek = async () => {
    setCopying(true);
    try {
      // One batched write on the server: a closed tab used to leave half a week behind.
      const { created } = await api.timeEntries.copyWeek({
        sourceWeekStart: addDays(weekStart, -7).toISOString(),
        targetWeekStart: weekStart.toISOString(),
      });
      if (created.length === 0) {
        toast.info("No entries to copy from last week");
        return;
      }
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success(
        `Copied ${created.length} ${created.length === 1 ? "entry" : "entries"} from last week`,
        {
          action: {
            label: "Undo",
            onClick: async () => {
              await api.timeEntries.bulkDelete(created.map((c) => c.id));
              queryClient.invalidateQueries({ queryKey: ["time-entries"] });
              queryClient.invalidateQueries({ queryKey: ["reports"] });
            },
          },
        }
      );
    } catch (error) {
      toastApiError(error, "Couldn't copy last week");
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-auto">
      <TimesheetGridBody
        days={days}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        rows={rows}
        cells={cells}
        dayTotals={dayTotals}
        grandTotal={grandTotal}
        editing={editing}
        draft={draft}
        onDraftChange={setDraft}
        onStartEdit={(row, day, initialValue) => {
          setDraft(initialValue);
          setEditing({ row, day });
        }}
        onCommitCell={commitCell}
        onCancelEdit={() => setEditing(null)}
        onAddRow={() => setAddOpen(true)}
        onCopyLastWeek={handleCopyLastWeek}
        copying={copying}
      />

      <AddTimesheetRowDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(row) => {
          setExtraRows((prev) => (prev.some((r) => r.key === row.key) ? prev : [...prev, row]));
        }}
      />
    </div>
  );
}
