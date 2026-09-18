import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProjectPicker } from "@/components/pickers/ProjectPicker";
import { TaskPicker } from "@/components/pickers/TaskPicker";
import { cn } from "@/lib/utils";

interface TimerBarProjectTaskProps {
  projectId: string | null;
  taskId: string | null;
  isRunning: boolean;
  projectPickerOpen: boolean;
  holdOpen: boolean;
  onProjectPickerOpenChange: (open: boolean) => void;
  onProjectChange: (id: string) => void;
  onClearProject: () => void;
  onTaskChange: (id: string | null) => void;
}

/** The project chip (+ its clear button) and the task picker beside it. */
export function TimerBarProjectTask({
  projectId,
  taskId,
  isRunning,
  projectPickerOpen,
  holdOpen,
  onProjectPickerOpenChange,
  onProjectChange,
  onClearProject,
  onTaskChange,
}: TimerBarProjectTaskProps) {
  return (
    <>
      {/* Project + task chips. Button's base is `shrink-0`, so these could never
          give up width and the overflow came out of the controls instead.
          `basis-28` is the load-bearing part: flex wraps a line *before* it
          shrinks anything, so chips sized by their content (178px + 184px for a
          real project name) pushed the control cluster onto a row of its own at
          every width below `lg`. Sizing them from a 7rem basis and letting them
          grow into the leftover keeps chips and controls on one line down to
          768px, and the same 7rem as `min-w` stops them collapsing into
          unreadable slivers when they genuinely don't fit. */}
      {/* The clear button used to float loose next to the picker, unrelated to it at a
          glance — one pill now houses both, so "this button clears that chip" reads
          without having to notice they're separate elements. */}
      <div className="tt-touch flex shrink items-center rounded-full max-xl:min-w-28 max-xl:grow max-xl:basis-28">
        <ProjectPicker
          value={projectId}
          open={projectPickerOpen}
          holdOpen={holdOpen}
          onOpenChange={onProjectPickerOpenChange}
          onChange={onProjectChange}
          compact
          className={cn("min-w-0 flex-1", isRunning || !projectId ? "rounded-full" : "rounded-l-full rounded-r-none")}
        />
        {/* The picker itself never offers "no project" — every entry needs one (D3) — but the
            bar pre-fills the last one used while idle, and there was no way back to a blank slate. */}
        {!isRunning && projectId && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Clear project"
            onClick={onClearProject}
            className="shrink-0 rounded-l-none rounded-r-full text-muted-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Task picker — only when a project is selected */}
      <TaskPicker
        projectId={projectId}
        value={taskId}
        onChange={onTaskChange}
        compact
        // Empty, it's an icon and a chevron — nothing to grow for. Forcing 7rem on it
        // anyway was the actual space hog on a tablet-width screen; only claim room
        // once there's a task name that needs it.
        className={cn("tt-touch shrink", taskId ? "max-xl:min-w-28 max-xl:grow max-xl:basis-28" : "shrink-0")}
      />
    </>
  );
}
