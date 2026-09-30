import { Button } from "@/components/ui/button";
import { SelectionBar } from "@/components/ui/selection-bar";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Columns3, Trash2 } from "lucide-react";
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

/** The column-visibility menu, plus the floating bulk bar while rows are selected. */
export function DetailedTableToolbar({
  selectedCount,
  onClearSelection,
  onBulkBillable,
  onBulkRemove,
  menuColumns,
  visible,
  onToggleColumn,
}: DetailedTableToolbarProps) {
  return (
    <div className="flex justify-end print:hidden">
      {selectedCount > 0 && (
        <SelectionBar label={`${selectedCount} selected`} onClear={onClearSelection}>
          <Button variant="ghost" size="sm" onClick={() => onBulkBillable(true)}>
            Billable
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onBulkBillable(false)}>
            Non-billable
          </Button>
          <Button variant="ghost" size="sm" className="gap-1.5 text-destructive hover:text-destructive" onClick={onBulkRemove}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </SelectionBar>
      )}
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
