import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useUIStore } from "@/stores/uiStore";
import {
  useUpdateEntry,
  useDeleteEntry,
  useCreateEntry,
  useBulkUpdateEntries,
  useBulkDeleteEntries,
} from "@/hooks/useEntries";
import { EntryForm } from "@/components/forms/EntryForm";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  ChevronUp,
  MoreHorizontal,
  Pencil,
  Copy,
  DollarSign,
  Trash2,
  Inbox,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import { COLUMNS, renderCell, type ColumnKey, type DetailedEntry } from "./DetailedTableColumns";
import { DetailedTableToolbar } from "./DetailedTableToolbar";

export type { DetailedEntry } from "./DetailedTableColumns";

const STORAGE_KEY = "reports_detailed_columns";

function loadVisible(): Record<ColumnKey, boolean> {
  const defaults = Object.fromEntries(
    COLUMNS.map((c) => [c.key, c.defaultVisible])
  ) as Record<ColumnKey, boolean>;
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") };
  } catch {
    return defaults;
  }
}

interface DetailedTableProps {
  entries: DetailedEntry[];
  /** The report's "Hide amounts": wins over the column toggle so a client report can't carry money by accident. */
  hideAmounts?: boolean;
}

export function DetailedTable({ entries, hideAmounts = false }: DetailedTableProps) {
  const timeFormat = useUIStore((s) => s.timeFormat);
  const currency = useUIStore((s) => s.currency);
  const [visible, setVisible] = useState<Record<ColumnKey, boolean>>(loadVisible);
  const [sort, setSort] = useState<{ key: ColumnKey; dir: "asc" | "desc" }>({
    key: "date",
    dir: "desc",
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<DetailedEntry | null>(null);

  const updateEntry = useUpdateEntry();
  const deleteEntry = useDeleteEntry();
  const createEntry = useCreateEntry();
  const bulkUpdate = useBulkUpdateEntries();
  const bulkDelete = useBulkDeleteEntries();

  const toggleColumn = (key: ColumnKey) =>
    setVisible((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });

  const setSortKey = (key: ColumnKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "date" || key === "amount" || key === "duration" ? "desc" : "asc" }
    );

  const menuColumns = COLUMNS.filter((c) => !(hideAmounts && c.key === "amount"));
  const cols = menuColumns.filter((c) => visible[c.key]);

  const sorted = useMemo(() => {
    const col = COLUMNS.find((c) => c.key === sort.key)!;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...entries].sort((a, b) => {
      const av = col.sortValue(a);
      const bv = col.sortValue(b);
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });
  }, [entries, sort]);

  const clearSelection = () => setSelected(new Set());
  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = sorted.length > 0 && selected.size === sorted.length;
  const someSelected = selected.size > 0 && !allSelected;
  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(sorted.map((e) => e.id)));

  const duplicate = (e: DetailedEntry) => {
    // Every entry needs a project (D3); an older entry without one has to get one first.
    if (!e.projectId) {
      toast.error("Give this entry a project before duplicating it");
      return;
    }
    createEntry.mutate({
      description: e.description,
      projectId: e.projectId,
      taskId: e.taskId,
      start: e.start,
      stop: e.stop,
      billable: e.billable,
      tags: e.tags,
    });
  };

  const bulkBillable = (billable: boolean) =>
    bulkUpdate.mutate(
      { ids: [...selected], patch: { billable } },
      { onSuccess: clearSelection }
    );
  const bulkRemove = () =>
    bulkDelete.mutate([...selected], { onSuccess: clearSelection });

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No entries for this period"
        description="Try widening the date range or adjusting your filters."
      />
    );
  }

  return (
    <div className="space-y-3">
      <DetailedTableToolbar
        selectedCount={selected.size}
        onClearSelection={clearSelection}
        onBulkBillable={bulkBillable}
        onBulkRemove={bulkRemove}
        menuColumns={menuColumns}
        visible={visible}
        onToggleColumn={toggleColumn}
      />

      {/* Table */}
      <div className="rounded-lg border">
        {/* Its own scroll region so the column headers survive a 500-row report
            and the tabs/filters above stay put. Print unbounds it so the whole
            table still flows onto pages. */}
        <Table containerClassName="max-h-[60vh] overflow-y-auto print:max-h-none print:overflow-visible">
          <TableHeader>
            <TableRow className="[&>th]:sticky [&>th]:top-0 [&>th]:z-sticky [&>th]:bg-muted [&>th]:shadow-[inset_0_-1px_0_var(--border)] hover:bg-transparent">
              <TableHead className="w-8 rounded-tl-lg print:hidden" aria-label="Select">
                <Checkbox
                  size="sm"
                  aria-label="Select all"
                  checked={someSelected ? "indeterminate" : allSelected}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              {cols.map((c) => (
                <TableHead key={c.key} className={cn("text-xs", c.align === "right" && "text-right")}>
                  {/* raw: a column header's own sort trigger, not a standalone action */}
                  <button
                    type="button"
                    onClick={() => setSortKey(c.key)}
                    className={cn(
                      "hit-area inline-flex items-center gap-1 transition-colors duration-fast ease-out-quart hover:text-foreground",
                      c.align === "right" && "flex-row-reverse"
                    )}
                  >
                    {c.label}
                    {sort.key === c.key &&
                      (sort.dir === "asc" ? (
                        <ChevronUp className="h-3 w-3" />
                      ) : (
                        <ChevronDown className="h-3 w-3" />
                      ))}
                  </button>
                </TableHead>
              ))}
              <TableHead className="w-8 rounded-tr-lg print:hidden" aria-label="Actions" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((entry) => (
              <TableRow key={entry.id} data-state={selected.has(entry.id) ? "selected" : undefined}>
                <TableCell className="print:hidden">
                  <Checkbox
                    size="sm"
                    aria-label={`Select ${entry.description || "entry"}`}
                    checked={selected.has(entry.id)}
                    onCheckedChange={() => toggleSelect(entry.id)}
                  />
                </TableCell>
                {cols.map((c) => (
                  <TableCell
                    key={c.key}
                    className={cn(
                      "py-2.5",
                      c.align === "right" && "text-right font-mono text-xs tabular-nums",
                      (c.key === "date" || c.key === "time") && "text-xs text-muted-foreground",
                      c.key === "amount" && "text-muted-foreground"
                    )}
                  >
                    {renderCell(c.key, entry, timeFormat, currency)}
                  </TableCell>
                ))}
                <TableCell className="py-2.5 print:hidden">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                        // One per row, so an unnamed trigger is 32 nameless
                        // buttons on a full report. EntryRow's equivalent has
                        // always been labelled "Entry actions"; this was drift.
                        aria-label={`Actions for ${entry.description || "entry"}`}
                        title="Entry actions"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditing(entry)}>
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => duplicate(entry)}>
                        <Copy className="h-3.5 w-3.5" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() =>
                          updateEntry.mutate({ id: entry.id, data: { billable: !entry.billable } })
                        }
                      >
                        <DollarSign className="h-3.5 w-3.5" />
                        {entry.billable ? "Mark non-billable" : "Mark billable"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => deleteEntry.mutate(entry.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="border-t bg-muted/20 px-4 py-2 text-right text-xs text-muted-foreground">
          {entries.length} entr{entries.length !== 1 ? "ies" : "y"}
        </div>
      </div>

      {editing && (
        <EntryForm entry={editing} open onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
