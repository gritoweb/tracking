import type { ReactNode } from "react";
import { Archive, Edit2 } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";

interface TaskRailRowProps {
  active?: boolean;
  onClick?: () => void;
  /** Icon or colour dot, centred in a fixed slot so every row's label starts at the same x. */
  leading: ReactNode;
  label: string;
  count?: number;
  /** Bolder, muted-until-active label: how a client row reads next to its projects. */
  heading?: boolean;
  actions?: ReactNode;
}

/** One row of the tasks rail. "All tasks", a client and a project share this, so their size and actions column never drift. */
export function TaskRailRow({ active, onClick, leading, label, count, heading, actions }: TaskRailRowProps) {
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
    <div className="flex items-center gap-0.5">
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

interface RailContextMenuProps {
  onEdit: () => void;
  onArchive: () => void;
  children: ReactNode;
}

/** Right-click Edit / Archive on a rail row; the row has no visible actions button. */
export function RailContextMenu({ onEdit, onArchive, children }: RailContextMenuProps) {
  return (
    <ContextMenu>
      {/* A div, not the row itself: TaskRailRow doesn't forward the trigger's ref and handlers. */}
      <ContextMenuTrigger asChild>
        <div>{children}</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onEdit}>
          <Edit2 />
          Edit
        </ContextMenuItem>
        <ContextMenuItem onSelect={onArchive}>
          <Archive />
          Archive
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
