import { Clock, Flag, MoreHorizontal, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { dateToLocalDate, localDateToDate, PRIORITIES, PRIORITY_LABEL } from "@/lib/taskUtils";
import type { Task } from "@shared/schemas";

const RECUR_OPTIONS = [
  { value: "", label: "Doesn't repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Every weekday" },
  { value: "weekly", label: "Weekly on this day" },
  { value: "monthly", label: "Monthly on this date" },
];

interface TaskRowActionsProps {
  task: Task;
  nested: boolean;
  onEdit?: (task: Task) => void;
  onLogTime: (task: Task) => void;
  onAddSubtask?: (task: Task) => void;
  onRequestDelete: (task: Task) => void;
  onOpenLogTimeSheet: () => void;
  onChangePriority: (priority: number) => void;
  onChangeRecurRule: (rule: string | null) => void;
}

/** Log-time button + the row's "more actions" menu — pure view, no mutations. */
export function TaskRowActions({
  task,
  nested,
  onEdit,
  onLogTime,
  onAddSubtask,
  onRequestDelete,
  onOpenLogTimeSheet,
  onChangePriority,
  onChangeRecurRule,
}: TaskRowActionsProps) {
  return (
    <div className="tt-reveal flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={`Log time to ${task.name}`}
        title="Log time already spent on this task"
        onClick={() => onLogTime(task)}
      >
        <Clock className="h-3 w-3" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-xs" aria-label={`More actions for ${task.name}`}>
            <MoreHorizontal className="h-3 w-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {onEdit && (
            <DropdownMenuItem onSelect={() => onEdit(task)}>
              <Pencil className="h-3.5 w-3.5" />
              Edit task…
            </DropdownMenuItem>
          )}

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Flag className="h-3.5 w-3.5" />
              Priority
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={String(task.priority)}
                onValueChange={(v) => onChangePriority(Number(v))}
              >
                {PRIORITIES.map((p) => (
                  <DropdownMenuRadioItem key={p} value={String(p)}>
                    {PRIORITY_LABEL[p]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {/* Recurrence belongs to the thing you schedule; a repeating
              subtask would spawn siblings inside a parent that never
              repeats, so the server rejects it and the menu doesn't offer it. */}
          {!nested && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Repeat className="h-3.5 w-3.5" />
                Repeat
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={task.recurRule?.split(":")[0] ?? ""}
                  onValueChange={(v) => {
                    const anchor = task.dueDate ?? dateToLocalDate(new Date());
                    const rule =
                      v === ""
                        ? null
                        : v === "weekly"
                          ? `weekly:${localDateToDate(anchor).getDay()}`
                          : v === "monthly"
                            ? `monthly:${localDateToDate(anchor).getDate()}`
                            : v;
                    onChangeRecurRule(rule);
                  }}
                >
                  {RECUR_OPTIONS.map((o) => (
                    <DropdownMenuRadioItem key={o.value} value={o.value}>
                      {o.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {!nested && onAddSubtask && (
            <DropdownMenuItem onSelect={() => onAddSubtask(task)}>
              <Plus className="h-3.5 w-3.5" />
              Add subtask
            </DropdownMenuItem>
          )}

          <DropdownMenuItem onSelect={onOpenLogTimeSheet}>
            <Clock className="h-3.5 w-3.5" />
            Log time
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => onRequestDelete(task)}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
