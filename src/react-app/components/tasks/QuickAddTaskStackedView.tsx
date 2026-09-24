import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MultiSelect } from "@/components/pickers/MultiSelect";
import { ProjectPicker } from "@/components/pickers/ProjectPicker";
import { TaskFieldRow } from "./TaskFieldRow";
import { CalendarDays, FolderOpen, UserPlus } from "lucide-react";
import { formatDueDate, dateToLocalDate, localDateToDate, PRIORITY_LABEL, type ParsedQuickAdd } from "@/lib/taskUtils";
import { cn } from "@/lib/utils";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";
import type { Project } from "@shared/schemas";

interface QuickAddTaskStackedViewProps {
  className?: string;
  value: string;
  onValueChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  autoFocus: boolean;
  canSubmit: boolean;
  /** The last add is still on its way to the server: the button shows it and won't send another. */
  pending: boolean;
  onSubmit: () => void;
  showProjectField: boolean;
  projectId: string | null;
  onProjectChange: (id: string) => void;
  pickedProject: Project | undefined;
  manualDueDate: string | null;
  dueOpen: boolean;
  onDueOpenChange: (open: boolean) => void;
  onManualDueDateChange: (date: string | null) => void;
  members: WorkspaceMember[];
  assigneeIds: string[];
  onAssigneeIdsChange: (ids: string[]) => void;
  parsed: ParsedQuickAdd;
  hinted: Project | undefined;
  effectiveProjectId: string | null;
  hasAnyProject: boolean;
}

/** The board's own open card — a full field per line on its own surface. Pure view. */
export function QuickAddTaskStackedView({
  className,
  value,
  onValueChange,
  onKeyDown,
  autoFocus,
  canSubmit,
  pending,
  onSubmit,
  showProjectField,
  projectId,
  onProjectChange,
  pickedProject,
  manualDueDate,
  dueOpen,
  onDueOpenChange,
  onManualDueDateChange,
  members,
  assigneeIds,
  onAssigneeIdsChange,
  parsed,
  hinted,
  effectiveProjectId,
  hasAnyProject,
}: QuickAddTaskStackedViewProps) {
  return (
    <div className={cn("space-y-1 rounded-container bg-popover p-2.5", className)}>
      <div className="flex items-center gap-2">
        <Input
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Task name"
          aria-label="Add a task"
          variant="bare"
          className="h-7 text-sm"
        />
        <Button size="sm" disabled={!canSubmit} onClick={onSubmit}>
          {pending && <Spinner size="sm" />}
          Add
        </Button>
      </div>

      {showProjectField && (
        <ProjectPicker value={projectId} onChange={onProjectChange}>
          <TaskFieldRow icon={<FolderOpen className="h-3.5 w-3.5" />} label={pickedProject?.name ?? "Project"} muted={!pickedProject} />
        </ProjectPicker>
      )}

      <Popover open={dueOpen} onOpenChange={onDueOpenChange}>
        <PopoverTrigger asChild>
          <TaskFieldRow
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
              onManualDueDateChange(date ? dateToLocalDate(date) : null);
              onDueOpenChange(false);
            }}
          />
        </PopoverContent>
      </Popover>

      <MultiSelect
        label="Assignees"
        closeOnSelect
        options={members.map((m) => ({ value: m.userId, label: m.name, image: m.image }))}
        value={assigneeIds}
        onChange={onAssigneeIdsChange}
        trigger={
          <TaskFieldRow
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
          {hasAnyProject ? "Choose a project to add this task." : "Create a project first — tasks belong to one."}
        </p>
      )}
    </div>
  );
}
