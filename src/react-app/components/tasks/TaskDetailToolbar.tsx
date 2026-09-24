import { AppWindow, MoreHorizontal, PanelRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { TaskViewMode } from "@/stores/uiStore";

interface TaskDetailToolbarProps {
  mode: TaskViewMode;
  onModeChange: (mode: TaskViewMode) => void;
  onDeleteTask: () => void;
}

/** The task detail's top strip, shared by the modal and the sidebar — both close buttons sit to its right. */
export function TaskDetailToolbar({ mode, onModeChange, onDeleteTask }: TaskDetailToolbarProps) {
  const next: TaskViewMode = mode === "modal" ? "sidebar" : "modal";
  const nextLabel = next === "modal" ? "Open as modal" : "Open in sidebar";
  const NextIcon = next === "modal" ? AppWindow : PanelRight;

  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b px-4 pr-12">
      {/* "..." rather than a bare trash icon, so delete isn't a stray misclick. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Task actions"
            title="Task actions"
            className="text-muted-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem variant="destructive" onClick={onDeleteTask}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete task
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={nextLabel}
        title={nextLabel}
        className="ml-auto text-muted-foreground"
        onClick={() => onModeChange(next)}
      >
        <NextIcon className="h-4 w-4" />
      </Button>
    </div>
  );
}
