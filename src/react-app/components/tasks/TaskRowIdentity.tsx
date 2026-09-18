import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { SpentFigure } from "@/components/ui/spent-figure";
import { formatDurationShort } from "@/lib/dateUtils";
import { descriptionToPlainText } from "@/lib/richText";
import { cn } from "@/lib/utils";
import type { Task } from "@shared/schemas";

interface TaskRowIdentityProps {
  task: Task;
  editingName: boolean;
  name: string;
  onNameChange: (value: string) => void;
  onStartEditName: () => void;
  onSaveName: () => void;
  onCancelEditName: () => void;
  editingTime: boolean;
  estimate: string;
  onEstimateChange: (value: string) => void;
  onStartEditTime: () => void;
  onSaveEstimate: () => void;
  onCancelEditTime: () => void;
  progress: number | null;
}

/** Name (click-to-rename) + description preview + tracked/estimate progress — pure view, no mutations. */
export function TaskRowIdentity({
  task,
  editingName,
  name,
  onNameChange,
  onStartEditName,
  onSaveName,
  onCancelEditName,
  editingTime,
  estimate,
  onEstimateChange,
  onStartEditTime,
  onSaveEstimate,
  onCancelEditTime,
  progress,
}: TaskRowIdentityProps) {
  const plainDescription = descriptionToPlainText(task.description);

  return (
    <div className="min-w-0 flex-1">
      {editingName ? (
        <Input
          autoFocus
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onBlur={onSaveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSaveName();
            if (e.key === "Escape") onCancelEditName();
          }}
          className="h-6 py-0 text-sm"
        />
      ) : (
        // Click-to-rename: the fast path for a typo, so the dialog is only for
        // the things that actually need a form.
        <button
          type="button"
          title="Click to rename"
          onClick={onStartEditName}
          className={cn(
            "block max-w-full truncate text-left text-sm",
            !task.active && "text-muted-foreground line-through"
          )}
        >
          {task.name}
        </button>
      )}

      {/* Notes sit under the name, clamped to one line: enough to recognise
          what the task is about, never enough to turn the list into prose.
          The full text is in the dialog and in the tooltip. */}
      {task.description && (
        <p className="mt-0.5 line-clamp-1 text-micro text-muted-foreground" title={plainDescription}>
          {plainDescription}
        </p>
      )}

      {editingTime ? (
        <div className="mt-0.5">
          <Input
            autoFocus
            value={estimate}
            onChange={(e) => onEstimateChange(e.target.value)}
            onBlur={onSaveEstimate}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSaveEstimate();
              if (e.key === "Escape") onCancelEditTime();
            }}
            placeholder="e.g. 1h 30m"
            title="Estimated time — e.g. 1h 30m, 1:30, 90m"
            className="h-5 w-28 py-0 text-micro"
          />
        </div>
      ) : progress !== null ? (
        <button
          className="mt-0.5 flex w-full max-w-xs items-center gap-1.5 transition-opacity duration-fast ease-out-quart hover:opacity-70"
          onClick={onStartEditTime}
        >
          <Progress value={progress} className="h-1 flex-1" aria-hidden />
          <SpentFigure
            spent={formatDurationShort(task.trackedSeconds)}
            of={formatDurationShort(task.estimatedSeconds!)}
          />
        </button>
      ) : task.trackedSeconds > 0 ? (
        <button
          // gap-1.5, not gap-1: the trailing space in the text node is swallowed
          // at the flex-item boundary, so the dashed underline started hard
          // against the "·" and read tighter than the spaces around it.
          className="mt-0.5 flex items-center gap-1.5 text-micro text-muted-foreground transition-opacity duration-fast ease-out-quart hover:opacity-70"
          onClick={onStartEditTime}
        >
          <span>{formatDurationShort(task.trackedSeconds)} tracked ·</span>
          <span className="underline decoration-dashed">add estimate</span>
        </button>
      ) : (
        <button
          // `block`: a bare <button> is inline-block, so this ran onto the same
          // line as the task name ("Data mappingadd estimate"). The other two
          // states are flex and already drop below; mt-0.5 shows this meant to.
          className="mt-0.5 block text-micro text-muted-foreground/0 transition-colors duration-fast ease-out-quart group-hover:text-muted-foreground/50 hover:text-muted-foreground!"
          onClick={onStartEditTime}
        >
          add estimate
        </button>
      )}
    </div>
  );
}
