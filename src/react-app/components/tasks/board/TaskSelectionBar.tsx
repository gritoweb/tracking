import { useState } from "react";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  CircleDot,
  Copy,
  CornerDownRight,
  Flag,
  FolderInput,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { SelectionBar } from "@/components/ui/selection-bar";
import { ColorDot } from "@/components/ColorDot";
import { MultiSelect } from "@/components/pickers/MultiSelect";
import { ProjectPicker } from "@/components/pickers/ProjectPicker";
import { useBulkTaskAction, useBulkUpdateTasks } from "@/hooks/useTasks";
import { useCanDeleteTask } from "@/hooks/useTaskPermissions";
import { useWorkspaceMembers } from "@/hooks/useWorkspaceRole";
import { PRIORITIES, PRIORITY_LABEL, dateToLocalDate } from "@/lib/taskUtils";
import { todayLocalDate } from "@shared/task-recurrence";
import { taskPath } from "@shared/task-links";
import type { BulkUpdateTasks, Task, TaskStatus } from "@shared/schemas";

type Patch = BulkUpdateTasks["items"][number]["patch"];

interface TaskSelectionBarProps {
  selected: Task[];
  /** The board's columns, for "Status". */
  statuses: TaskStatus[];
  /** Every task on the page, for "Convert to subtask"'s parent list. */
  tasks: Task[];
  onClear: () => void;
}

const NOT_YOURS = "Only the task's author or a workspace owner/admin can do this to every selected task";

/** The board's bulk actions; every edit is each task's own PUT on the server, so rules and history match a single edit. */
export function TaskSelectionBar({ selected, statuses, tasks, onClear }: TaskSelectionBarProps) {
  const bulk = useBulkTaskAction();
  const bulkUpdate = useBulkUpdateTasks();
  const canDelete = useCanDeleteTask();
  const { data: members = [], isPending: membersLoading } = useWorkspaceMembers(true);
  const [dueOpen, setDueOpen] = useState(false);
  const [parentOpen, setParentOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const ids = selected.map((t) => t.id);
  const busy = bulk.isPending || bulkUpdate.isPending;
  const allYours = selected.every(canDelete);
  const allArchived = selected.every((t) => t.archivedAt);
  const hasSubtasks = selected.some((t) => t.subtaskTotal > 0);
  const label = `${selected.length} task${selected.length === 1 ? "" : "s"} selected`;

  const apply = (patchFor: (task: Task) => Patch) =>
    bulkUpdate.mutate({ items: selected.map((t) => ({ id: t.id, patch: patchFor(t) })) });

  // People on every selected task; picking adds someone to all of them, unpicking removes them from all.
  const sharedAssignees = members
    .map((m) => m.userId)
    .filter((userId) => selected.every((t) => t.assignees.some((a) => a.userId === userId)));
  const changeAssignees = (next: string[]) => {
    const added = next.filter((id) => !sharedAssignees.includes(id));
    const removed = sharedAssignees.filter((id) => !next.includes(id));
    apply((t) => ({
      assigneeIds: [...new Set([...t.assignees.map((a) => a.userId), ...added])].filter((id) => !removed.includes(id)),
    }));
  };

  const selectedIds = new Set(ids);
  const parents = tasks.filter((t) => !t.parentId && !t.archivedAt && !selectedIds.has(t.id));

  const copy = async () => {
    const text = selected.map((t) => `${t.name} — ${window.location.origin}${taskPath(t.id)}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Copied ${selected.length} task${selected.length === 1 ? "" : "s"}`);
    } catch {
      toast.error("Couldn't copy to the clipboard");
    }
  };

  return (
    <>
      <SelectionBar label={label} onClear={onClear}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Set status" title="Status" disabled={busy}>
              <CircleDot className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start">
            {statuses.map((s) => (
              <DropdownMenuItem
                key={s.id}
                onSelect={() =>
                  apply(() => ({ statusId: s.id, ...(s.category === "completed" ? { completedOn: todayLocalDate() } : {}) }))
                }
              >
                <ColorDot color={s.color} />
                {s.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <MultiSelect
          label="Assignees"
          options={members.map((m) => ({ value: m.userId, label: m.name, image: m.image }))}
          value={sharedAssignees}
          onChange={changeAssignees}
          loading={membersLoading}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label="Assignees" title="Assignees" disabled={busy}>
              <UserPlus className="h-4 w-4" />
            </Button>
          }
        />

        <Popover open={dueOpen} onOpenChange={setDueOpen}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Due date" title="Due date" disabled={busy}>
              <CalendarDays className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-auto p-0">
            <Calendar
              mode="single"
              onSelect={(date) => {
                apply(() => ({ dueDate: date ? dateToLocalDate(date) : null }));
                setDueOpen(false);
              }}
            />
            <div className="border-t p-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start"
                onClick={() => {
                  apply(() => ({ dueDate: null }));
                  setDueOpen(false);
                }}
              >
                Clear due date
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Priority" title="Priority" disabled={busy}>
              <Flag className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top">
            {PRIORITIES.map((p) => (
              <DropdownMenuItem key={p} onSelect={() => apply(() => ({ priority: p }))}>
                {PRIORITY_LABEL[p]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <ProjectPicker value={null} onChange={(projectId) => apply(() => ({ projectId }))}>
          <Button variant="ghost" size="icon-sm" aria-label="Move to project" title="Move to project" disabled={busy}>
            <FolderInput className="h-4 w-4" />
          </Button>
        </ProjectPicker>

        <Popover open={parentOpen} onOpenChange={setParentOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Convert to subtask"
              title={hasSubtasks ? "A task that has subtasks can't become a subtask" : "Convert to subtask"}
              disabled={busy || hasSubtasks}
            >
              <CornerDownRight className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" className="w-72 p-0">
            <Command>
              <CommandInput placeholder="Parent task…" />
              <CommandList>
                <CommandEmpty>No task found</CommandEmpty>
                {parents.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`${p.name} ${p.id}`}
                    onSelect={() => {
                      apply(() => ({ parentId: p.id }));
                      setParentOpen(false);
                    }}
                  >
                    <span className="truncate">{p.name}</span>
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        <Button variant="ghost" size="icon-sm" aria-label="Copy names and links" title="Copy names and links" onClick={copy}>
          <Copy className="h-4 w-4" />
        </Button>

        {allArchived ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Unarchive"
            title={allYours ? "Unarchive" : NOT_YOURS}
            disabled={busy || !allYours}
            onClick={() => bulk.mutate({ ids, action: "unarchive" }, { onSuccess: onClear })}
          >
            <ArchiveRestore className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Archive"
            title={allYours ? "Archive" : NOT_YOURS}
            disabled={busy || !allYours}
            onClick={() => bulk.mutate({ ids, action: "archive" }, { onSuccess: onClear })}
          >
            <Archive className="h-4 w-4" />
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Delete"
          title={allYours ? "Delete" : NOT_YOURS}
          disabled={busy || !allYours}
          onClick={() => setConfirmDelete(true)}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </SelectionBar>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${label.replace(" selected", "")}?`}
        description="They will be permanently deleted with their subtasks, comments and files. Time already tracked against them is kept. To keep them out of the way instead, archive them."
        onConfirm={() => {
          setConfirmDelete(false);
          bulk.mutate({ ids, action: "delete" }, { onSuccess: onClear });
        }}
      />
    </>
  );
}
