import { useMemo } from "react";
import { FolderOpen } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ColorDot } from "@/components/ColorDot";
import { useProjects } from "@/hooks/useProjects";
import { useMediaQuery, BELOW_MD } from "@/hooks/useMediaQuery";
import { groupProjectsByClient } from "@/lib/taskUtils";
import { cn } from "@/lib/utils";
import type { Task } from "@shared/schemas";

interface TaskProjectRailProps {
  tasks: Task[];
  projectId: string | null;
  onChange: (projectId: string | null) => void;
}

/** Every project, grouped by client, as the page's own scope filter. */
export function TaskProjectRail({ tasks, projectId, onChange }: TaskProjectRailProps) {
  const { data: projects = [] } = useProjects();
  const narrow = useMediaQuery(BELOW_MD);

  const openCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of tasks) {
      if (t.parentId || !t.active) continue;
      counts.set(t.projectId, (counts.get(t.projectId) ?? 0) + 1);
    }
    return counts;
  }, [tasks]);

  const totalOpen = useMemo(
    () => tasks.filter((t) => !t.parentId && t.active).length,
    [tasks]
  );

  const groups = useMemo(() => groupProjectsByClient(projects), [projects]);

  if (narrow) {
    return (
      <Select
        value={projectId ?? "all"}
        onValueChange={(v) => onChange(v === "all" ? null : v)}
      >
        <SelectTrigger className="w-full" aria-label="Filter by project">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All tasks ({totalOpen})</SelectItem>
          {groups.map((group) => (
            <SelectGroup key={group.clientName ?? "none"}>
              <SelectLabel>{group.clientName ?? "No client"}</SelectLabel>
              {group.projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name} ({openCounts.get(p.id) ?? 0})
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    );
  }

  return (
    <nav
      aria-label="Projects"
      className="w-56 shrink-0 space-y-4 overflow-y-auto border-r pr-4"
    >
      <button
        type="button"
        onClick={() => onChange(null)}
        aria-current={projectId === null ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium",
          "transition-colors duration-fast ease-out-quart",
          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
          projectId === null
            ? "bg-primary/10 text-primary-ink"
            : "text-foreground hover:bg-accent"
        )}
      >
        <FolderOpen className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">All tasks</span>
        <span className="tabular-nums text-xs text-muted-foreground">{totalOpen}</span>
      </button>

      {groups.map((group) => (
        <div key={group.clientName ?? "none"}>
          <h3 className="px-2 text-xs font-medium text-muted-foreground">
            {group.clientName ?? "No client"}
          </h3>
          <div className="mt-1 space-y-0.5">
            {group.projects.map((project) => {
              const active = projectId === project.id;
              return (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => onChange(project.id)}
                  aria-current={active ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                    "transition-colors duration-fast ease-out-quart",
                    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    active ? "bg-primary/10 text-primary-ink" : "text-foreground hover:bg-accent"
                  )}
                >
                  <ColorDot color={project.color} />
                  <span className="min-w-0 flex-1 truncate">{project.name}</span>
                  <span className="tabular-nums text-xs text-muted-foreground">
                    {openCounts.get(project.id) ?? 0}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}
