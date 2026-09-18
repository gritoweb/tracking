import type { CSSProperties } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ColorDot } from "@/components/ColorDot";
import { useTaskStatuses } from "@/hooks/useTaskStatuses";
import { useUpdateTask } from "@/hooks/useTasks";
import { cn } from "@/lib/utils";
import type { Task } from "@shared/schemas";

interface TaskStatusChipProps {
  task: Task;
  className?: string;
}

/** A task's column, in the list — the chip is the control, same as the due chip. */
export function TaskStatusChip({ task, className }: TaskStatusChipProps) {
  const { data: statuses = [] } = useTaskStatuses(task.projectId);
  const updateTask = useUpdateTask();

  if (!task.statusId || !statuses.length) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Status: ${task.statusName ?? "none"} — change`}
          style={{ "--swatch": task.statusColor } as CSSProperties}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs tt-swatch-tint",
            "transition-colors duration-fast ease-out-quart hover:brightness-95",
            "focus-ring",
            className
          )}
        >
          <ColorDot color={task.statusColor} className="h-2 w-2" />
          <span className="max-w-24 truncate">{task.statusName}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={task.statusId}
          onValueChange={(statusId) => updateTask.mutate({ id: task.id, data: { statusId } })}
        >
          {statuses.map((s) => (
            <DropdownMenuRadioItem key={s.id} value={s.id}>
              <span className="flex items-center gap-2">
                <ColorDot color={s.color} className="h-2 w-2" />
                {s.name}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
