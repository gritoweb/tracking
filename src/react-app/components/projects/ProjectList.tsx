import { useState } from "react";
import { Plus, FolderOpen, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SearchInput } from "@/components/ui/search-input";
import { ProjectForm } from "@/components/forms/ProjectForm";
import { ProjectListRow } from "./ProjectListRow";
import {
  useAllProjects,
  useDeleteProject,
  useUpdateProject,
  useProjectPacing,
} from "@/hooks/useProjects";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { Target } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useUIStore } from "@/stores/uiStore";
import { CollectionHeader } from "@/components/layout/CollectionHeader";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  COLLECTION_PERIODS,
  resolveCollectionPeriod,
  type CollectionPeriod,
} from "@/lib/collectionPeriod";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ProjectSort = "name" | "client" | "tracked" | "rate";
import type { Project } from "@shared/schemas";

export function ProjectList() {
  // Defaults to all time, and says so. Clients opens on this month; the two
  // pages answer different questions, so they keep different defaults — but
  // they now use one vocabulary and neither leaves its window implicit. The
  // budget bar below stays all-time whatever this is set to.
  const [period, setPeriod] = useState<CollectionPeriod>("all");
  const range = resolveCollectionPeriod(period);
  const periodLabel =
    COLLECTION_PERIODS.find((p) => p.value === period)?.label ?? "All time";
  const { data: projects = [], isLoading } = useAllProjects(range);
  // Pacing covers active projects only (an archived project has nothing left to
  // pace), so the row falls back to the plain percentage when it's absent.
  const { data: pacing = [] } = useProjectPacing();
  const pacingByProject = new Map(pacing.map((p) => [p.projectId, p]));
  const currency = useUIStore((s) => s.currency);
  const deleteProject = useDeleteProject();
  const updateProject = useUpdateProject();
  // Editing, archiving and budgets are for owners/admins; the server refuses a member (D3).
  const { canManage } = useWorkspaceRole();
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Project | null>(null);
  const [expandedTasks, setExpandedTasks] = useState<Set<string>>(new Set());
  // Two critiques flagged the same gap: at 30 projects this page was a scroll
  // with no way to narrow it, while Clients had a period control and Tasks had
  // three selects. Search matches the client name too — "everything for EY" is
  // how a consultant thinks about their project list.
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<ProjectSort>("name");

  const toggleTasks = (id: string) =>
    setExpandedTasks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /**
   * Pacing is invisible until a project has a time budget, which reads as the
   * feature being broken rather than unconfigured — there is no bar, no verdict,
   * and nothing on screen saying what would produce one.
   *
   * Said ONCE above the list rather than per row: a hint on every unbudgeted
   * project would stripe the page and nag about a thing that is optional. It
   * clears itself the moment any project gets a budget, and stays hidden for a
   * workspace with nothing tracked yet, where it would be noise on top of an
   * empty state.
   */
  const anyBudgeted = projects.some((p) => p.estimatedHours);
  const anyTracked = projects.some((p) => (p.trackedSeconds ?? 0) > 0);
  const showBudgetHint = canManage && !isLoading && !anyBudgeted && anyTracked;

  const q = query.trim().toLowerCase();
  const visible = projects
    .filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.clientName ?? "").toLowerCase().includes(q)
    )
    .sort((a, b) => {
      switch (sortBy) {
        case "tracked":
          return (b.trackedSeconds ?? 0) - (a.trackedSeconds ?? 0);
        case "client":
          return (a.clientName ?? "￿").localeCompare(b.clientName ?? "￿")
            || a.name.localeCompare(b.name);
        case "rate":
          return (b.rate ?? -1) - (a.rate ?? -1) || a.name.localeCompare(b.name);
        default:
          return a.name.localeCompare(b.name);
      }
    });

  if (isLoading) {
    return (
      <div className="space-y-3 p-6">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6">
      <CollectionHeader
        title="Projects"
        // While a search is narrowing the list, the count has to describe what
        // is on screen — "4 active" above zero visible rows reads as a bug.
        subtitle={
          q
            ? `${visible.length} of ${projects.length} shown`
            : `${projects.filter((p) => p.active).length} active`
        }
      >
        {projects.length > 0 && (
          <>
            <SearchInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              aria-label="Search projects by name or client"
              className="h-8 w-48"
            />
            <SegmentedControl
              label="Period"
              options={[...COLLECTION_PERIODS]}
              value={period}
              onChange={setPeriod}
            />
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as ProjectSort)}>
              <SelectTrigger size="sm" className="w-36" aria-label="Sort projects">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">Sort: Name</SelectItem>
                <SelectItem value="client">Sort: Client</SelectItem>
                <SelectItem value="tracked">Sort: Tracked</SelectItem>
                <SelectItem value="rate">Sort: Rate</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
        <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" />
          New project
        </Button>
      </CollectionHeader>

      {showBudgetHint && (
        <div className="mb-3 flex items-start gap-2.5 rounded-lg border border-dashed px-3.5 py-2.5">
          <Target className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-normal text-muted-foreground">
            <span className="font-medium text-foreground">No budgets set.</span> Add{" "}
            <span className="font-medium">Estimated hours</span> to a project and it
            starts reporting how fast it&apos;s burning and whether it lands over — here,
            in the assistant, and in your briefing. Hours only; no rates involved.
          </p>
        </div>
      )}

      <div className="space-y-1.5">
        {visible.map((project) => (
          <ProjectListRow
            key={project.id}
            project={project}
            pacing={pacingByProject.get(project.id)}
            period={period}
            periodLabel={periodLabel}
            currency={currency}
            canManage={canManage}
            isExpanded={expandedTasks.has(project.id)}
            onToggleExpanded={() => toggleTasks(project.id)}
            onEdit={() => setEditProject(project)}
            onArchiveToggle={() =>
              project.active
                ? setArchiveTarget(project)
                : updateProject.mutate({ id: project.id, data: { active: true } })
            }
          />
        ))}

        {projects.length === 0 && (
          <EmptyState
            icon={FolderOpen}
            title="No projects yet"
            description="Group your time entries by project and track budgets."
            action={
              <Button size="sm" onClick={() => setShowCreate(true)}>
                <Plus className="h-3.5 w-3.5" />
                Create your first project
              </Button>
            }
          />
        )}

        {/* Filtered to nothing is a different state from having nothing, and it
            wants a different way out — clear the query, not create a project. */}
        {projects.length > 0 && visible.length === 0 && (
          <EmptyState
            icon={Search}
            title={`No projects match "${query.trim()}"`}
            description="Search looks at the project name and its client."
            action={
              <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                Clear search
              </Button>
            }
          />
        )}
      </div>

      {showCreate && <ProjectForm open onClose={() => setShowCreate(false)} />}
      {editProject && (
        <ProjectForm project={editProject} open onClose={() => setEditProject(null)} />
      )}

      <ConfirmDialog
        open={!!archiveTarget}
        onOpenChange={(open) => !open && setArchiveTarget(null)}
        title="Archive project?"
        description={`"${archiveTarget?.name}" will stop appearing in pickers and active lists. You can unarchive it later from its menu.`}
        confirmLabel="Archive"
        onConfirm={() => {
          if (archiveTarget) deleteProject.mutate(archiveTarget.id);
          setArchiveTarget(null);
        }}
      />
    </div>
  );
}
