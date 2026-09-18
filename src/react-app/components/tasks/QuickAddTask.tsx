import { useState } from "react";
import { QuickAddTaskStackedView } from "./QuickAddTaskStackedView";
import { QuickAddTaskInlineView } from "./QuickAddTaskInlineView";
import { useCreateTask } from "@/hooks/useTasks";
import { useProjects } from "@/hooks/useProjects";
import { useWorkspaceMembers } from "@/hooks/useWorkspaceRole";
import { parseQuickAdd } from "@/lib/taskUtils";
import type { Project } from "@shared/schemas";

interface QuickAddTaskProps {
  /** Preselected project — the group being added into, or the last one used. */
  defaultProjectId?: string | null;
  /** Seeds the due date, so adding inside "Tomorrow" produces a task due tomorrow. */
  defaultDueDate?: string | null;
  /** Creates a subtask of this task instead of a top-level one. */
  parentId?: string | null;
  /** Board column to capture into — omitted means the workspace default. */
  defaultStatusId?: string | null;
  autoFocus?: boolean;
  placeholder?: string;
  onDone?: () => void;
  /** The board's own open card — a full field per line on its own white surface, not a dashed one-liner. */
  stacked?: boolean;
  /** No dashed box — for a spot that already sits inside its own container (a subtask list), where a second border would nest a box inside a box. */
  bare?: boolean;
  className?: string;
}

/**
 * Inline capture: type, Enter, keep typing.
 *
 * Not a dialog. Adding a task is the highest-frequency action on this page and
 * the one most sensitive to friction — a modal per task is how a list stops
 * getting used, because the cost of capturing the fourth thing you thought of is
 * an open/fill/submit/reopen cycle. The field stays focused after each Enter, so
 * five tasks is five lines of typing.
 *
 * `TaskDialog` survives for the deliberate case (the empty state, and anything
 * needing the fields this line can't express — notes, an estimate, a repeat).
 *
 * Controller: owns hooks/mutations/state; QuickAddTaskStackedView/InlineView are pure views.
 */
export function QuickAddTask({
  defaultProjectId = null,
  defaultDueDate = null,
  parentId = null,
  defaultStatusId = null,
  autoFocus = false,
  placeholder = "Add a task — try “draft report tomorrow p1”",
  onDone,
  stacked = false,
  bare = false,
  className,
}: QuickAddTaskProps) {
  const createTask = useCreateTask();
  const { data: projects = [] } = useProjects();
  const { data: members = [] } = useWorkspaceMembers(true);
  const [value, setValue] = useState("");
  const [projectId, setProjectId] = useState<string | null>(defaultProjectId);
  // A manual pick beats whatever the text parser found — it's the more deliberate choice.
  const [manualDueDate, setManualDueDate] = useState<string | null>(null);
  const [dueOpen, setDueOpen] = useState(false);
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);

  // With exactly one project there is no choice to make, and asking for it turns
  // every capture into two interactions. `null` still means "not chosen" for
  // everyone else — a task silently filed under a project the user didn't pick
  // is worse than one that won't submit.
  const soleProject = projects.length === 1 ? projects[0].id : null;

  const parsed = parseQuickAdd(value);
  // `#token` resolves against real project names; an unmatched hint is left as
  // plain text rather than silently filed somewhere the user didn't name.
  const hinted: Project | undefined = parsed.projectHint
    ? projects.find((p: Project) => p.name.toLowerCase().replace(/\s+/g, "-").startsWith(parsed.projectHint!))
    : undefined;
  const effectiveProjectId = hinted?.id ?? projectId ?? soleProject;
  const dueDate = manualDueDate ?? parsed.dueDate ?? defaultDueDate;
  const pickedProject = projectId ? projects.find((p) => p.id === projectId) : undefined;
  const showProjectField = !parentId && !hinted && !soleProject;

  const canSubmit = parsed.name.length > 0 && !!effectiveProjectId;

  const reset = () => {
    setValue("");
    setManualDueDate(null);
    setAssigneeIds([]);
  };

  const submit = () => {
    if (!canSubmit || !effectiveProjectId) return;
    createTask.mutate(
      {
        name: parsed.name,
        projectId: effectiveProjectId,
        ...(dueDate ? { dueDate } : {}),
        ...(parsed.priority ? { priority: parsed.priority } : {}),
        ...(parentId ? { parentId } : {}),
        ...(defaultStatusId ? { statusId: defaultStatusId } : {}),
        ...(assigneeIds.length ? { assigneeIds } : {}),
      },
      // Clear on success only. Clearing optimistically and then failing loses
      // what the user typed, and this field's whole job is not losing it.
      { onSuccess: reset }
    );
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
    if (e.key === "Escape") {
      setValue("");
      onDone?.();
    }
  };

  if (stacked) {
    return (
      <QuickAddTaskStackedView
        className={className}
        value={value}
        onValueChange={setValue}
        onKeyDown={onKeyDown}
        autoFocus={autoFocus}
        canSubmit={canSubmit}
        onSubmit={submit}
        showProjectField={showProjectField}
        projectId={projectId}
        onProjectChange={setProjectId}
        pickedProject={pickedProject}
        manualDueDate={manualDueDate}
        dueOpen={dueOpen}
        onDueOpenChange={setDueOpen}
        onManualDueDateChange={setManualDueDate}
        members={members}
        assigneeIds={assigneeIds}
        onAssigneeIdsChange={setAssigneeIds}
        parsed={parsed}
        hinted={hinted}
        effectiveProjectId={effectiveProjectId}
        hasAnyProject={projects.length > 0}
      />
    );
  }

  return (
    <QuickAddTaskInlineView
      className={className}
      bare={bare}
      placeholder={placeholder}
      value={value}
      onValueChange={setValue}
      onKeyDown={onKeyDown}
      autoFocus={autoFocus}
      canSubmit={canSubmit}
      showProjectField={showProjectField}
      projectId={projectId}
      onProjectChange={setProjectId}
      manualDueDate={manualDueDate}
      dueOpen={dueOpen}
      onDueOpenChange={setDueOpen}
      onManualDueDateChange={setManualDueDate}
      members={members}
      assigneeIds={assigneeIds}
      onAssigneeIdsChange={setAssigneeIds}
      parsed={parsed}
      hinted={hinted}
      dueDate={dueDate}
      effectiveProjectId={effectiveProjectId}
      hasAnyProject={projects.length > 0}
    />
  );
}
