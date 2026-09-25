import { ExternalLink, ListPlus, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { AvatarStack } from "@/components/ui/avatar";
import { QuickAddTask } from "./QuickAddTask";
import { cn } from "@/lib/utils";
import type { Task } from "@shared/schemas";

interface TaskSubtasksProps {
  task: Task;
  subtasks: Task[];
  onToggle: (subtask: Task, done: boolean) => void;
  onOpen: (subtaskId: string) => void;
  onRequestDelete: (subtask: Task) => void;
}

/** Subtask checklist + inline quick-add — pure view, no mutations of its own. */
export function TaskSubtasks({ task, subtasks, onToggle, onOpen, onRequestDelete }: TaskSubtasksProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-base font-semibold">
        <ListPlus className="h-4 w-4" />
        Subtasks{task.subtaskTotal ? ` (${task.subtaskDone}/${task.subtaskTotal})` : ""}
      </Label>
      {/* No enclosing box — a border around the list plus the quick-add's own
          dashed border was a box inside a box. Rows divide with a hairline;
          the quick-add stands on its own underneath. */}
      <div className="space-y-1">
        {/* Rows in their own group, so `last:` reaches the last row and not the add field below it. */}
        <div>
          {subtasks.map((sub) => (
            <div key={sub.id} className="group flex items-center gap-2 border-b px-1 py-1.5 last:border-b-0">
              <Checkbox
                checked={!sub.active}
                onCheckedChange={(checked) => onToggle(sub, checked === true)}
                aria-label={sub.active ? "Mark subtask done" : "Mark subtask not done"}
              />
              {/* Opens the subtask in its own sheet — same panel, same edit/assignee/delete
                  it would get as a top-level task, not a second stripped-down view of it. */}
              <button
                onClick={() => onOpen(sub.id)}
                className={cn(
                  "min-w-0 flex-1 truncate rounded text-left text-sm hover:underline",
                  !sub.active && "text-muted-foreground line-through"
                )}
              >
                {sub.name}
              </button>
              {sub.assignees.length > 0 && (
                <AvatarStack members={sub.assignees.map((a) => ({ id: a.userId, name: a.name, image: a.image }))} max={3} size="xs" />
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-xs" aria-label={`More actions for ${sub.name}`} className="tt-reveal">
                    <MoreHorizontal className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onSelect={() => onOpen(sub.id)}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open subtask
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => onRequestDelete(sub)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
        <QuickAddTask
          className={subtasks.length > 0 ? "mt-2" : undefined}
          parentId={task.id}
          defaultProjectId={task.projectId}
          placeholder="Add a subtask"
          bare
        />
      </div>
    </div>
  );
}
