import { FolderOpen } from "lucide-react";
import { ProjectPicker } from "./ProjectPicker";

/**
 * Dashed "Project" chip for entries without a project — opens the picker in
 * place so an unbillable entry can be fixed without the edit dialog. Dashed
 * border matches the calendar's ghost/gap affordance: unfilled, actionable.
 */
export function AssignProjectChip({
  onAssign,
  ariaLabel = "Assign project",
}: {
  onAssign: (projectId: string) => void;
  ariaLabel?: string;
}) {
  return (
    <ProjectPicker value={null} onChange={onAssign}>
      <button
        type="button"
        aria-label={ariaLabel}
        className="flex h-4 items-center gap-1 rounded-full border border-dashed border-muted-foreground/40 px-1.5 text-micro font-medium text-muted-foreground transition-colors duration-fast ease-out-quart hover:border-primary hover:text-primary-ink focus-ring"
      >
        <FolderOpen className="h-2.5 w-2.5" />
        Project
      </button>
    </ProjectPicker>
  );
}
