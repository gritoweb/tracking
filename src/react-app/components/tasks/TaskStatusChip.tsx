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
  const { data: statuses = [] } = useTaskStatuses();
  const updateTask = useUpdateTask();

  if (!task.statusId || !statuses.length) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`Status: ${task.statusName ?? "none"} — change`}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded px-1 text-xs text-muted-foreground",
            "transition-colors duration-fast ease-out-quart hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
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
