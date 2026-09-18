import { useRef } from "react";
import { Plus, CornerDownLeft, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MultiSelect } from "@/components/pickers/MultiSelect";
import { AssignButton } from "@/components/ui/assign-button";
import { AvatarStack } from "@/components/ui/avatar";
import { ProjectPicker } from "@/components/pickers/ProjectPicker";
import { formatDueDate, dateToLocalDate, localDateToDate, PRIORITY_LABEL, type ParsedQuickAdd } from "@/lib/taskUtils";
import { cn } from "@/lib/utils";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";
import type { Project } from "@shared/schemas";

interface QuickAddTaskInlineViewProps {
  className?: string;
  bare: boolean;
  placeholder: string;
  value: string;
  onValueChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  autoFocus: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  showProjectField: boolean;
  projectId: string | null;
  onProjectChange: (id: string) => void;
  manualDueDate: string | null;
  dueOpen: boolean;
  onDueOpenChange: (open: boolean) => void;
  onManualDueDateChange: (date: string | null) => void;
  members: WorkspaceMember[];
  assigneeIds: string[];
  onAssigneeIdsChange: (ids: string[]) => void;
  parsed: ParsedQuickAdd;
  hinted: Project | undefined;
  dueDate: string | null;
  effectiveProjectId: string | null;
  hasAnyProject: boolean;
}

/** The dashed one-liner used everywhere QuickAddTask isn't the board's own open card. Pure view. */
export function QuickAddTaskInlineView({
  className,
  bare,
  placeholder,
  value,
  onValueChange,
  onKeyDown,
  autoFocus,
  canSubmit,
  onSubmit,
  showProjectField,
  projectId,
  onProjectChange,
  manualDueDate,
  dueOpen,
  onDueOpenChange,
  onManualDueDateChange,
  members,
  assigneeIds,
  onAssigneeIdsChange,
  parsed,
  hinted,
  dueDate,
  effectiveProjectId,
  hasAnyProject,
}: QuickAddTaskInlineViewProps) {
  const inputRef = useRef<HTMLInputElement>(null);
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
        {/* The "+" is the button: it adds what is typed, or puts the cursor in the field when nothing is. */}
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Add"
          title={canSubmit ? "Add (Enter)" : "Type a name to add"}
          onClick={() => (canSubmit ? onSubmit() : inputRef.current?.focus())}
          className="shrink-0 text-muted-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
        <Input
          ref={inputRef}
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label="Add a task"
          className="h-6 border-0 bg-transparent px-0 py-0 text-sm shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
        {showProjectField && (
          <ProjectPicker value={projectId} onChange={onProjectChange} className="shrink-0 rounded-md" />
        )}

        <Popover open={dueOpen} onOpenChange={onDueOpenChange}>
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
            assigneeIds.length > 0 ? (
              // Raw: MultiSelect's custom trigger, wrapping the avatar stack
              <button type="button" aria-label="Edit assignees" className="shrink-0 rounded-full focus-ring">
                <AvatarStack
                  members={assigneeIds
                    .map((id) => members.find((x) => x.userId === id))
                    .filter((m): m is WorkspaceMember => !!m)
                    .map((m) => ({ id: m.userId, name: m.name, image: m.image }))}
                  max={3}
                  size="xs"
                />
              </button>
            ) : (
              <AssignButton className="shrink-0" reveal="always" />
            )
          }
        />

        {canSubmit && <CornerDownLeft className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />}
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
          {hasAnyProject ? "Choose a project to add this task." : "Create a project first — tasks belong to one."}
        </p>
      )}
    </div>
  );
}
