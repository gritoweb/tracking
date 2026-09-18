import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Columns3, Trash2, X } from "lucide-react";
import type { ColumnDef, ColumnKey } from "./DetailedTableColumns";

interface DetailedTableToolbarProps {
  selectedCount: number;
  onClearSelection: () => void;
  onBulkBillable: (billable: boolean) => void;
  onBulkRemove: () => void;
  menuColumns: ColumnDef[];
  visible: Record<ColumnKey, boolean>;
  onToggleColumn: (key: ColumnKey) => void;
}

/** Bulk action bar when rows are selected, else the column-visibility menu. */
export function DetailedTableToolbar({
  selectedCount,
  onClearSelection,
  onBulkBillable,
  onBulkRemove,
  menuColumns,
  visible,
  onToggleColumn,
}: DetailedTableToolbarProps) {
  if (selectedCount > 0) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 print:hidden">
        <span className="text-sm font-medium">{selectedCount} selected</span>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-8" onClick={() => onBulkBillable(true)}>
            Billable
          </Button>
          <Button variant="outline" size="sm" className="h-8" onClick={() => onBulkBillable(false)}>
            Non-billable
          </Button>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-destructive" onClick={onBulkRemove}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={onClearSelection} aria-label="Clear selection">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-end print:hidden">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-sm">
            <Columns3 className="h-3.5 w-3.5" />
            Columns
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {menuColumns.map((c) => (
            <DropdownMenuCheckboxItem
              key={c.key}
              checked={visible[c.key]}
              onCheckedChange={() => onToggleColumn(c.key)}
              onSelect={(e) => e.preventDefault()}
            >
              {c.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
