import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { DatePicker } from "@/components/ui/date-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProjectPicker } from "@/components/pickers/ProjectPicker";
import { MultiSelect } from "@/components/pickers/MultiSelect";
import { ColorDot } from "@/components/ColorDot";
import { PRIORITIES, PRIORITY_LABEL, dateToLocalDate, localDateToDate } from "@/lib/taskUtils";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";
import type { TaskStatus } from "@shared/schemas";

const REPEAT_OPTIONS = [
  { value: "none", label: "Doesn't repeat" },
  { value: "daily", label: "Every day" },
  { value: "weekdays", label: "Every weekday" },
  { value: "weekly", label: "Weekly on the due day" },
  { value: "monthly", label: "Monthly on the due date" },
];

interface TaskDialogFieldsProps {
  name: string;
  onNameChange: (value: string) => void;
  onEnterSubmit: () => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  isSubtask: boolean;
  projectId: string | null;
  onProjectChange: (id: string) => void;
  statuses: TaskStatus[];
  statusValue: string;
  onStatusChange: (id: string) => void;
  estimate: string;
  onEstimateChange: (value: string) => void;
  priority: number;
  onPriorityChange: (priority: number) => void;
  dueDate: string | null;
  onDueDateChange: (date: string | null) => void;
  members: WorkspaceMember[];
  membersLoading: boolean;
  assigneeIds: string[];
  onAssigneeIdsChange: (ids: string[]) => void;
  repeat: string;
  onRepeatChange: (repeat: string) => void;
}

/** The task form's own fields — shared by create and edit, one form for both. Pure view. */
export function TaskDialogFields({
  name,
  onNameChange,
  onEnterSubmit,
  description,
  onDescriptionChange,
  isSubtask,
  projectId,
  onProjectChange,
  statuses,
  statusValue,
  onStatusChange,
  estimate,
  onEstimateChange,
  priority,
  onPriorityChange,
  dueDate,
  onDueDateChange,
  members,
  membersLoading,
  assigneeIds,
  onAssigneeIdsChange,
  repeat,
  onRepeatChange,
}: TaskDialogFieldsProps) {
  return (
    <div className="space-y-4 py-2">
      <div className="space-y-1.5">
        <Label htmlFor="task-name">Name</Label>
        <Input
          id="task-name"
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onEnterSubmit()}
          placeholder="What needs doing?"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="task-notes">Notes</Label>
        <Textarea
          id="task-notes"
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          // No Enter-to-submit here: this is the one field where a newline is
          // the expected result of pressing Return.
          placeholder="Context, links, acceptance criteria — anything that isn't the name."
          rows={3}
          className="resize-y"
        />
      </div>

      {!isSubtask && (
        <div className="space-y-1.5">
          <Label>Project</Label>
          <div>
            <ProjectPicker value={projectId} onChange={onProjectChange} className="rounded-md" />
          </div>
        </div>
      )}

      {/* Beside Project, not Estimate — a third field there would orphan a cell. */}
      <div className="space-y-1.5">
        <Label>Status</Label>
        <Select value={statusValue} onValueChange={onStatusChange}>
          <SelectTrigger className="w-full" aria-label="Status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {statuses.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <span className="flex items-center gap-2">
                  <ColorDot color={s.color} className="h-2 w-2" />
                  {s.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="task-estimate">Estimate</Label>
          <Input
            id="task-estimate"
            value={estimate}
            onChange={(e) => onEstimateChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onEnterSubmit()}
            placeholder="e.g. 1h 30m"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Priority</Label>
          <Select value={String(priority)} onValueChange={(v) => onPriorityChange(Number(v))}>
            <SelectTrigger className="w-full" aria-label="Priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p} value={String(p)}>
                  {PRIORITY_LABEL[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Due date</Label>
        <div className="flex items-center gap-2">
          {/* min-w-0 flex-1, not a bare sibling: DatePicker's trigger is
              `w-full`, so beside a flex sibling it claims the whole row and
              pushes Clear off the edge of the dialog. */}
          <div className="min-w-0 flex-1">
            <DatePicker
              value={dueDate ? localDateToDate(dueDate) : new Date()}
              onSelect={(d) => onDueDateChange(dateToLocalDate(d))}
              className={dueDate ? undefined : "text-muted-foreground"}
            />
          </div>
          {dueDate && (
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => onDueDateChange(null)}
              aria-label="Clear due date"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Assignees</Label>
        <MultiSelect
          label="Assignees"
          closeOnSelect
          options={members.map((m) => ({ value: m.userId, label: m.name, image: m.image }))}
          value={assigneeIds}
          onChange={onAssigneeIdsChange}
          loading={membersLoading}
        />
      </div>

      {!isSubtask && (
        <div className="space-y-1.5">
          <Label>Repeat</Label>
          <Select value={repeat} onValueChange={onRepeatChange}>
            <SelectTrigger className="w-full" aria-label="Repeat">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPEAT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {/* Completing an occurrence is what creates the next one — say so,
              or a repeat that hasn't visibly done anything reads as broken. */}
          {repeat !== "none" && (
            <p className="text-micro text-muted-foreground">
              The next occurrence is created when you tick this one off.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
