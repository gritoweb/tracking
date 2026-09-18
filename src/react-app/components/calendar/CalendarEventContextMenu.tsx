import { Pencil, Copy, Trash2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import type { EditableEntry } from "@/components/forms/EntryForm";

interface ContextMenuState {
  entry: EditableEntry;
  x: number;
  y: number;
}

interface CalendarEventContextMenuProps {
  contextMenu: ContextMenuState | null;
  onClose: () => void;
  onEdit: (entry: EditableEntry) => void;
  onDuplicate: (entry: EditableEntry) => void;
  onDelete: (entry: EditableEntry) => void;
}

// Right-click menu for a real, non-running entry. Positioned at the click
// coordinates rather than nested in eventContent — FullCalendar renders that
// through its own flushSync-based portal, and a Radix menu mounted inside it
// fought that render pass silently (console showed "flushSync was called
// from inside a lifecycle method" and the menu never opened).
export function CalendarEventContextMenu({
  contextMenu,
  onClose,
  onEdit,
  onDuplicate,
  onDelete,
}: CalendarEventContextMenuProps) {
  if (!contextMenu) return null;

  return (
    <DropdownMenu open onOpenChange={(open) => !open && onClose()}>
      {/* Popper needs a real anchor to measure from — this invisible 1px
          point at the click coordinates stands in for the trigger a
          context menu doesn't otherwise have. */}
      <DropdownMenuTrigger asChild>
        <span className="fixed h-px w-px" style={{ left: contextMenu.x, top: contextMenu.y }} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-40"
        align="start"
        side="bottom"
        sideOffset={0}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenuItem
          onSelect={() => {
            onEdit(contextMenu.entry);
            onClose();
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => {
            onDuplicate(contextMenu.entry);
            onClose();
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            onDelete(contextMenu.entry);
            onClose();
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
