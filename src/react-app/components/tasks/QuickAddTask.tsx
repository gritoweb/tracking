import { forwardRef, useState, type ReactNode, type ComponentPropsWithoutRef } from "react";
import { Plus, CornerDownLeft, CalendarDays, UserPlus, FolderOpen } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MultiSelect } from "@/components/pickers/MultiSelect";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { ProjectPicker } from "@/components/pickers/ProjectPicker";
import { useCreateTask } from "@/hooks/useTasks";
import { useProjects } from "@/hooks/useProjects";
import { useWorkspaceMembers } from "@/hooks/useWorkspaceRole";
import { parseQuickAdd, formatDueDate, dateToLocalDate, localDateToDate, PRIORITY_LABEL } from "@/lib/taskUtils";
import { cn } from "@/lib/utils";
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
 * One field on its own line in the stacked card — an icon and a label/value, opening whatever
 * wraps it. Forwards its ref and every prop a Radix `asChild` trigger (Popover, MultiSelect,
 * ProjectPicker) injects — onClick included — or the click that's meant to open it does nothing.
 */
const FieldRow = forwardRef<
  HTMLButtonElement,
  { icon: ReactNode; label: string; muted?: boolean } & ComponentPropsWithoutRef<"button">
>(({ icon, label, muted, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs",
      "transition-colors duration-fast ease-out-quart hover:bg-accent",
      muted ? "text-muted-foreground" : "text-foreground",
      className
    )}
    {...props}
  >
    <span className="text-muted-foreground">{icon}</span>
    {label}
  </button>
));
FieldRow.displayName = "FieldRow";

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

  const dueField = (
    <Popover open={dueOpen} onOpenChange={setDueOpen}>
      <PopoverTrigger asChild>
        <FieldRow
          icon={<CalendarDays className="h-3.5 w-3.5" />}
          label={manualDueDate ? formatDueDate(manualDueDate) : "Due date"}
          muted={!manualDueDate}
        />
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={manualDueDate ? localDateToDate(manualDueDate) : undefined}
          onSelect={(date) => {
            setManualDueDate(date ? dateToLocalDate(date) : null);
            setDueOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );

  const assigneeField = (
    <MultiSelect
      label="Assignees"
      closeOnSelect
      options={members.map((m) => ({ value: m.userId, label: m.name, image: m.image }))}
      value={assigneeIds}
      onChange={setAssigneeIds}
      trigger={
        <FieldRow
          icon={<UserPlus className="h-3.5 w-3.5" />}
          label={
            assigneeIds.length
              ? assigneeIds.map((id) => members.find((m) => m.userId === id)?.name).filter(Boolean).join(", ")
              : "Assignee"
          }
          muted={!assigneeIds.length}
        />
      }
    />
  );

  if (stacked) {
    return (
      <div className={cn("space-y-1 rounded-container border bg-popover p-2.5 shadow-sm", className)}>
        <div className="flex items-center gap-2">
          <Input
            autoFocus={autoFocus}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
              if (e.key === "Escape") {
                setValue("");
                onDone?.();
              }
            }}
            placeholder="Task name"
            aria-label="Add a task"
            className="h-7 border-0 px-0 text-sm shadow-none focus-visible:ring-0"
          />
          <Button size="sm" disabled={!canSubmit} onClick={submit}>
            Add
          </Button>
        </div>

        {!parentId && !hinted && !soleProject && (
          <ProjectPicker value={projectId} onChange={setProjectId}>
            <FieldRow icon={<FolderOpen className="h-3.5 w-3.5" />} label={pickedProject?.name ?? "Project"} muted={!pickedProject} />
          </ProjectPicker>
        )}
        {dueField}
        {assigneeField}

        {(parsed.dueDate || parsed.priority || hinted) && (
          <p className="px-1.5 pt-0.5 text-micro text-muted-foreground">
            {[
              parsed.dueDate ? `due ${formatDueDate(parsed.dueDate).toLowerCase()}` : null,
              parsed.priority ? `priority ${PRIORITY_LABEL[parsed.priority].toLowerCase()}` : null,
              hinted ? hinted.name : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        {parsed.name.length > 0 && !effectiveProjectId && (
          <p className="px-1.5 text-micro text-muted-foreground">
            {projects.length === 0 ? "Create a project first — tasks belong to one." : "Choose a project to add this task."}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("space-y-1", className)}>
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 transition-colors duration-fast ease-out-quart",
          bare
            ? "focus-within:bg-accent/50 rounded-md"
            : "rounded-md border border-dashed focus-within:border-solid focus-within:border-ring"
        )}
      >
        <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        <Input
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") {
              setValue("");
              onDone?.();
            }
          }}
          placeholder={placeholder}
          aria-label="Add a task"
          className="h-6 border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0"
        />
        {!parentId && !hinted && !soleProject && (
          <ProjectPicker value={projectId} onChange={setProjectId} className="shrink-0 rounded-md" />
        )}

        <Popover open={dueOpen} onOpenChange={setDueOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={manualDueDate ? `Due ${formatDueDate(manualDueDate)} — change` : "Set due date"}
              className="shrink-0 rounded p-0.5 text-muted-foreground/50 transition-colors duration-fast ease-out-quart hover:bg-muted hover:text-muted-foreground"
            >
              <CalendarDays className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="end">
            <Calendar
              mode="single"
              selected={manualDueDate ? localDateToDate(manualDueDate) : undefined}
              onSelect={(date) => {
                setManualDueDate(date ? dateToLocalDate(date) : null);
                setDueOpen(false);
              }}
            />
          </PopoverContent>
        </Popover>

        <MultiSelect
          label="Assignees"
          closeOnSelect
          options={members.map((m) => ({ value: m.userId, label: m.name, image: m.image }))}
          value={assigneeIds}
          onChange={setAssigneeIds}
          trigger={
            assigneeIds.length > 0 ? (
              <button type="button" aria-label="Edit assignees" className="flex shrink-0 -space-x-1.5">
                {assigneeIds.slice(0, 3).map((id) => {
                  const m = members.find((x) => x.userId === id);
                  return m ? (
                    <UserAvatar key={id} name={m.name} image={m.image} className="h-5 w-5 border-2 border-background text-micro" />
                  ) : null;
                })}
              </button>
            ) : (
              <button
                type="button"
                aria-label="Add assignee"
                className="shrink-0 rounded p-0.5 text-muted-foreground/50 transition-colors duration-fast ease-out-quart hover:bg-muted hover:text-muted-foreground"
              >
                <UserPlus className="h-3.5 w-3.5" />
              </button>
            )
          }
        />

        {canSubmit && (
          <CornerDownLeft className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
        )}
      </div>

      {/* Echo what the tokens were understood as, before Enter commits them.
          A parser that silently eats "fri" is worse than no parser — and since
          the tokens are stripped from the name, the name it will actually save
          is echoed too. */}
      {(parsed.dueDate || parsed.priority || hinted || manualDueDate || assigneeIds.length > 0) && (
        <p className="px-2 text-micro text-muted-foreground">
          {[
            `“${parsed.name}”`,
            dueDate ? `due ${formatDueDate(dueDate).toLowerCase()}` : null,
            parsed.priority ? `priority ${PRIORITY_LABEL[parsed.priority].toLowerCase()}` : null,
            hinted ? hinted.name : null,
            assigneeIds.length
              ? `assigned ${assigneeIds.map((id) => members.find((m) => m.userId === id)?.name).filter(Boolean).join(", ")}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      )}

      {/* Enter with no project chosen used to do nothing at all, with nothing on
          screen to say why — the one failure mode a capture field cannot have. */}
      {parsed.name.length > 0 && !effectiveProjectId && (
        <p className="px-2 text-micro text-muted-foreground">
          {projects.length === 0
            ? "Create a project first — tasks belong to one."
            : "Choose a project to add this task."}
        </p>
      )}
    </div>
  );
}
