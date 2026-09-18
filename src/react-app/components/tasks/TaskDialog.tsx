import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TaskDialogFields } from "./TaskDialogFields";
import { useCreateTask, useUpdateTask } from "@/hooks/useTasks";
import { useTaskStatuses } from "@/hooks/useTaskStatuses";
import { useWorkspaceMembers } from "@/hooks/useWorkspaceRole";
import { parseTimeInput, formatTimeInput } from "@/lib/dateUtils";
import { localDateToDate } from "@/lib/taskUtils";
import type { Task } from "@shared/schemas";

interface TaskDialogProps {
  open: boolean;
  onClose: () => void;
  /** Present = edit that task. Absent = create a new one. */
  task?: Task | null;
  /** Create only: pre-select this project (e.g. adding within a project group). */
  defaultProjectId?: string | null;
  /** Create only: pre-fill the due date (e.g. adding into a dated group). */
  defaultDueDate?: string | null;
  /** Create only: pre-select this board column. */
  defaultStatusId?: string | null;
}

/** Stored rule → the option that represents it in the picker. */
function repeatValue(rule: string | null): string {
  if (!rule) return "none";
  return rule.split(":")[0];
}

/**
 * One dialog for creating **and** editing a task.
 *
 * Two forms over the same eight fields drift the moment one of them gains a
 * ninth — which is exactly how "notes" would have ended up creatable but not
 * editable. The row keeps its fast paths (click the name to rename, click the
 * due chip to re-date); this is where everything else lives.
 *
 * Controller: owns hooks/mutations/state; TaskDialogFields is the pure view.
 */
export function TaskDialog({
  open,
  onClose,
  task = null,
  defaultProjectId = null,
  defaultDueDate = null,
  defaultStatusId = null,
}: TaskDialogProps) {
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const { data: members = [], isPending: membersLoading } = useWorkspaceMembers(open);
  const editing = Boolean(task);

  const [name, setName] = useState(task?.name ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [projectId, setProjectId] = useState<string | null>(task?.projectId ?? defaultProjectId);
  const { data: statuses = [] } = useTaskStatuses(projectId);
  const [estimate, setEstimate] = useState(formatTimeInput(task?.estimatedSeconds ?? null));
  const [dueDate, setDueDate] = useState<string | null>(task?.dueDate ?? defaultDueDate);
  const [priority, setPriority] = useState(task?.priority ?? 4);
  const [repeat, setRepeat] = useState(repeatValue(task?.recurRule ?? null));
  const [statusId, setStatusId] = useState<string | null>(task?.statusId ?? defaultStatusId);
  const [assigneeIds, setAssigneeIds] = useState<string[]>(task?.assignees.map((a) => a.userId) ?? []);

  // The dialog stays mounted between openings; reseed when it opens on another
  // task (or switches between create and edit).
  const [syncedId, setSyncedId] = useState<string | null>(task?.id ?? null);
  if (open && (task?.id ?? null) !== syncedId) {
    setSyncedId(task?.id ?? null);
    setName(task?.name ?? "");
    setDescription(task?.description ?? "");
    setProjectId(task?.projectId ?? defaultProjectId);
    setEstimate(formatTimeInput(task?.estimatedSeconds ?? null));
    setDueDate(task?.dueDate ?? defaultDueDate);
    setPriority(task?.priority ?? 4);
    setRepeat(repeatValue(task?.recurRule ?? null));
    setStatusId(task?.statusId ?? defaultStatusId);
    setAssigneeIds(task?.assignees.map((a) => a.userId) ?? []);
  }

  const reset = () => {
    setSyncedId(null);
    setName("");
    setDescription("");
    setProjectId(defaultProjectId);
    setEstimate("");
    setDueDate(defaultDueDate);
    setPriority(4);
    setRepeat("none");
    setStatusId(defaultStatusId);
    setAssigneeIds([]);
  };

  /**
   * "Weekly"/"Monthly" are anchored to the due date, falling back to today.
   * A weekly repeat with no anchor has nothing to repeat *on*, and picking one
   * silently (say, Monday) is a schedule the user never agreed to.
   */
  const resolveRepeat = (): string | null => {
    if (repeat === "none") return null;
    if (repeat === "daily" || repeat === "weekdays") return repeat;
    const anchor = dueDate ? localDateToDate(dueDate) : new Date();
    return repeat === "weekly" ? `weekly:${anchor.getDay()}` : `monthly:${anchor.getDate()}`;
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const pending = createTask.isPending || updateTask.isPending;
  const canSubmit = name.trim().length > 0 && !!projectId && !pending;

  const handleSubmit = () => {
    if (!projectId || !name.trim()) return;
    const parsed = estimate.trim() ? parseTimeInput(estimate.trim()) : null;
    const fields = {
      name: name.trim(),
      // Empty means *no* notes, not an empty string — the row decides whether to
      // render a second line on null, and "" would give it a blank one.
      description: description.trim() || null,
      estimatedSeconds: parsed,
      dueDate,
      priority,
      recurRule: resolveRepeat(),
      // Only when changed — sending it every save would refresh a done task's completed_at.
      ...(statusId && statusId !== task?.statusId ? { statusId } : {}),
    };

    if (task) {
      updateTask.mutate({ id: task.id, data: fields }, { onSuccess: handleClose });
    } else {
      createTask.mutate(
        { ...fields, projectId, ...(statusId ? { statusId } : {}), assigneeIds },
        { onSuccess: handleClose }
      );
    }
  };

  // A subtask belongs to its parent's project and can't repeat on its own — the
  // server enforces both, so the form must not offer either.
  const isSubtask = Boolean(task?.parentId);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="max-h-(--size-cap-85vh) overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit task" : "New task"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Notes stay with the task — they're never copied onto a time entry."
              : "Tasks belong to a project. Everything else is optional."}
          </DialogDescription>
        </DialogHeader>

        <TaskDialogFields
          name={name}
          onNameChange={setName}
          onEnterSubmit={() => canSubmit && handleSubmit()}
          description={description}
          onDescriptionChange={setDescription}
          isSubtask={isSubtask}
          projectId={projectId}
          onProjectChange={setProjectId}
          statuses={statuses}
          statusValue={statusId ?? statuses.find((s) => s.isDefault)?.id ?? ""}
          onStatusChange={setStatusId}
          estimate={estimate}
          onEstimateChange={setEstimate}
          priority={priority}
          onPriorityChange={setPriority}
          dueDate={dueDate}
          onDueDateChange={setDueDate}
          members={members}
          membersLoading={membersLoading}
          assigneeIds={assigneeIds}
          onAssigneeIdsChange={setAssigneeIds}
          repeat={repeat}
          onRepeatChange={setRepeat}
        />

        <DialogFooter>
          <Button variant="ghost" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {editing ? "Save changes" : "Add task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
