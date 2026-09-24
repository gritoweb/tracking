import { ColorDot } from "@/components/ColorDot";
import type { Task } from "@shared/schemas";

/** Above a subtask's name: which task it belongs to, with that task's status, one click away ("Subtask of"). */
export function TaskParentLink({ parent, onOpen }: { parent: Task; onOpen: (id: string) => void }) {
  return (
    <div className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      <span className="shrink-0">Subtask of</span>
      <button
        type="button"
        onClick={() => onOpen(parent.id)}
        aria-label={`Go to parent task: ${parent.name}`}
        title={parent.statusName ? `Current status: ${parent.statusName}` : undefined}
        className="flex min-w-0 items-center gap-1.5 rounded-md px-1 py-0.5 text-foreground transition-colors duration-fast ease-out-quart hover:bg-accent focus-ring"
      >
        <ColorDot color={parent.statusColor} className="h-2 w-2" />
        <span className="truncate">{parent.name}</span>
      </button>
    </div>
  );
}
