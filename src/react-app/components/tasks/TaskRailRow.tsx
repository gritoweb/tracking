import type { MouseEvent, ReactNode } from "react";
import { Archive, Edit2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface TaskRailRowProps {
  active?: boolean;
  onClick?: () => void;
  onContextMenu?: (e: MouseEvent) => void;
  /** Icon or colour dot, centred in a fixed slot so every row's label starts at the same x. */
  leading: ReactNode;
  label: string;
  count?: number;
  /** Bolder, muted-until-active label: how a client row reads next to its projects. */
  heading?: boolean;
  actions?: ReactNode;
}

/** One row of the tasks rail. "All tasks", a client and a project share this, so their size and actions column never drift. */
export function TaskRailRow({ active, onClick, onContextMenu, leading, label, count, heading, actions }: TaskRailRowProps) {
  const body = (
    <>
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{leading}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined && <span className="tabular-nums text-xs text-muted-foreground">{count}</span>}
    </>
  );
  const rowClass = cn(
    "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
    heading && "font-medium",
    active ? "bg-primary/10 text-primary-ink" : heading ? "text-muted-foreground" : "text-foreground"
  );
  return (
    <div className="flex items-center gap-0.5" onContextMenu={onContextMenu}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          aria-current={active ? "true" : undefined}
          className={cn(rowClass, "transition-colors duration-fast ease-out-quart focus-ring", !active && "hover:bg-accent")}
        >
          {body}
        </button>
      ) : (
        <div className={rowClass}>{body}</div>
      )}
      {/* Reserved even when empty, so a row without actions still lines up with one that has them. */}
      <div className="flex h-6 w-6 shrink-0 items-center justify-center">{actions}</div>
    </div>
  );
}

interface RailActionsMenuProps {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onArchive: () => void;
}

/** The Edit / Archive menu behind a row's "…" button; `open` is controlled so a right-click can open it too. */
export function RailActionsMenu({ label, open, onOpenChange, onEdit, onArchive }: RailActionsMenuProps) {
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label={`${label} actions`} className="shrink-0 text-muted-foreground">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{label} actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <Edit2 className="mr-2 h-3.5 w-3.5" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onArchive}>
          <Archive className="mr-2 h-3.5 w-3.5" />
          Archive
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
