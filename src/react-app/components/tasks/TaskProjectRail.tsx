import { useMemo, useState } from "react";
import { FolderOpen, MoreHorizontal, Edit2, Archive } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ColorDot } from "@/components/ColorDot";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProjectForm } from "@/components/forms/ProjectForm";
import { ClientForm } from "@/components/forms/ClientForm";
import { useProjects, useClients, useDeleteProject, useDeleteClient } from "@/hooks/useProjects";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { useMediaQuery, BELOW_MD } from "@/hooks/useMediaQuery";
import { groupProjectsByClient } from "@/lib/taskUtils";
import { cn } from "@/lib/utils";
import type { Client, Project, Task } from "@shared/schemas";

interface TaskProjectRailProps {
  tasks: Task[];
  projectId: string | null;
  onChange: (projectId: string | null) => void;
  /** Scope to every project under one client at once — mutually exclusive with `projectId`. */
  clientId: string | null;
  onClientChange: (clientId: string | null) => void;
}

/** Every project, grouped by client, as the page's own scope filter. */
export function TaskProjectRail({ tasks, projectId, onChange, clientId, onClientChange }: TaskProjectRailProps) {
  const { data: projects = [] } = useProjects();
  const { data: clients = [] } = useClients();
  const narrow = useMediaQuery(BELOW_MD);
  const { canManage } = useWorkspaceRole();
  // Only Archive is offered here: the rail only ever lists active projects/clients
  // (useProjects/useClients, not the *All* variants), so there's never a row to unarchive.
  const deleteProject = useDeleteProject();
  const deleteClient = useDeleteClient();
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [editClient, setEditClient] = useState<Client | null>(null);
  // Right-click on a row opens the same menu as its "..." button — one open at a time.
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  // Archive has no undo toast, so it goes through ConfirmDialog like every other destructive action.
  const [archiveProject, setArchiveProject] = useState<Project | null>(null);
  const [archiveClient, setArchiveClient] = useState<Client | null>(null);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

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
        aria-current={projectId === null && clientId === null ? "true" : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm font-medium",
          "transition-colors duration-fast ease-out-quart",
          "focus-ring",
          projectId === null && clientId === null
            ? "bg-primary/10 text-primary-ink"
            : "text-foreground hover:bg-accent"
        )}
      >
        <FolderOpen className="h-4 w-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate">All tasks</span>
        <span className="tabular-nums text-xs text-muted-foreground">{totalOpen}</span>
      </button>

      {groups.map((group) => {
        const client = group.clientId ? clientById.get(group.clientId) : undefined;
        const clientActive = client ? clientId === client.id : false;
        const clientOpenCount = group.projects.reduce((sum, p) => sum + (openCounts.get(p.id) ?? 0), 0);
        return (
          <div key={group.clientName ?? "none"}>
            <div
              className="flex items-center gap-1 px-2"
              onContextMenu={(e) => {
                if (!canManage || !client) return;
                e.preventDefault();
                setOpenMenu(`client:${client.id}`);
              }}
            >
              {client ? (
                <button
                  type="button"
                  onClick={() => onClientChange(clientActive ? null : client.id)}
                  aria-current={clientActive ? "true" : undefined}
                  className={cn(
                    "flex min-w-0 flex-1 items-center justify-between gap-2 rounded px-1 py-0.5 text-left text-xs font-medium",
                    "transition-colors duration-fast ease-out-quart",
                    "focus-ring",
                    clientActive ? "bg-primary/10 text-primary-ink" : "text-muted-foreground hover:bg-accent"
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{group.clientName}</span>
                  <span className="tabular-nums">{clientOpenCount}</span>
                </button>
              ) : (
                <h3 className="min-w-0 flex-1 truncate text-xs font-medium text-muted-foreground">
                  No client
                </h3>
              )}
              {canManage && client && (
                <DropdownMenu
                  open={openMenu === `client:${client.id}`}
                  onOpenChange={(o) => setOpenMenu(o ? `client:${client.id}` : null)}
                >
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`${client.name} actions`}
                      className="shrink-0 text-muted-foreground"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditClient(client)}>
                      <Edit2 className="mr-2 h-3.5 w-3.5" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setArchiveClient(client)}>
                      <Archive className="mr-2 h-3.5 w-3.5" />
                      Archive
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <div className="mt-1 space-y-0.5">
              {group.projects.map((project) => {
                const active = projectId === project.id;
                return (
                  <div
                    key={project.id}
                    className="group/rail flex items-center gap-0.5"
                    onContextMenu={(e) => {
                      if (!canManage) return;
                      e.preventDefault();
                      setOpenMenu(`project:${project.id}`);
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onChange(project.id)}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                        "transition-colors duration-fast ease-out-quart",
                        "focus-ring",
                        active ? "bg-primary/10 text-primary-ink" : "text-foreground hover:bg-accent"
                      )}
                    >
                      <ColorDot color={project.color} />
                      <span className="min-w-0 flex-1 truncate">{project.name}</span>
                      <span className="tabular-nums text-xs text-muted-foreground">
                        {openCounts.get(project.id) ?? 0}
                      </span>
                    </button>
                    {canManage && (
                      <DropdownMenu
                        open={openMenu === `project:${project.id}`}
                        onOpenChange={(o) => setOpenMenu(o ? `project:${project.id}` : null)}
                      >
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`${project.name} actions`}
                            className="shrink-0 text-muted-foreground"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setEditProject(project)}>
                            <Edit2 className="mr-2 h-3.5 w-3.5" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setArchiveProject(project)}>
                            <Archive className="mr-2 h-3.5 w-3.5" />
                            Archive
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      {editProject && (
        <ProjectForm project={editProject} open onClose={() => setEditProject(null)} />
      )}
      {editClient && (
        <ClientForm client={editClient} open onClose={() => setEditClient(null)} />
      )}

      <ConfirmDialog
        open={!!archiveProject}
        onOpenChange={(o) => !o && setArchiveProject(null)}
        title={`Archive "${archiveProject?.name}"?`}
        description="It disappears from active pickers. Nothing is deleted."
        confirmLabel="Archive"
        onConfirm={() => {
          if (archiveProject) deleteProject.mutate(archiveProject.id);
          setArchiveProject(null);
        }}
      />
      <ConfirmDialog
        open={!!archiveClient}
        onOpenChange={(o) => !o && setArchiveClient(null)}
        title={`Archive "${archiveClient?.name}"?`}
        description="It disappears from active pickers. Nothing is deleted."
        confirmLabel="Archive"
        onConfirm={() => {
          if (archiveClient) deleteClient.mutate(archiveClient.id);
          setArchiveClient(null);
        }}
      />
    </nav>
  );
}
