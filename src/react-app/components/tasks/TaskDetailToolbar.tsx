import { useRef, useState } from "react";
import { AppWindow, Check, MoreHorizontal, PanelRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TaskViewMode } from "@/stores/uiStore";

interface TaskDetailToolbarProps {
  mode: TaskViewMode;
  onModeChange: (mode: TaskViewMode) => void;
  onDeleteTask: () => void;
}

const MODES = [
  { value: "modal", label: "Modal", icon: AppWindow },
  { value: "sidebar", label: "Sidebar", icon: PanelRight },
] as const satisfies readonly { value: TaskViewMode; label: string; icon: typeof AppWindow }[];

/** Grace period so the pointer can travel from the button into its menu without the menu closing. */
const HOVER_CLOSE_DELAY_MS = 150;

/** The layout switch: opens on hover like ClickUp's, and on click/Enter for touch and keyboard. */
function ViewModeMenu({ mode, onModeChange }: Pick<TaskDetailToolbarProps, "mode" | "onModeChange">) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hoverOpen = () => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hoverClose = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), HOVER_CLOSE_DELAY_MS);
  };
  const Current = MODES.find((m) => m.value === mode)?.icon ?? AppWindow;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger asChild onPointerEnter={hoverOpen} onPointerLeave={hoverClose}>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Task view"
          title="Task view"
          className="ml-auto text-muted-foreground"
        >
          <Current className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onPointerEnter={hoverOpen} onPointerLeave={hoverClose}>
        <DropdownMenuLabel>Open tasks in</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={mode} onValueChange={(v) => onModeChange(v as TaskViewMode)}>
          {MODES.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value}>
              <Icon className="h-3.5 w-3.5" />
              {label}
              {value === mode && <Check className="ml-auto h-3.5 w-3.5" />}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The task detail's top strip, shared by the modal and the sidebar — both close buttons sit to its right. */
export function TaskDetailToolbar({ mode, onModeChange, onDeleteTask }: TaskDetailToolbarProps) {
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
      <ViewModeMenu mode={mode} onModeChange={onModeChange} />
    </div>
  );
}
