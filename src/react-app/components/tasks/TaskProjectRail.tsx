import { useMemo, useState } from "react";
import { FolderOpen, Users } from "lucide-react";
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
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProjectForm } from "@/components/forms/ProjectForm";
import { ClientForm } from "@/components/forms/ClientForm";
import { useProjects, useClients, useDeleteProject, useDeleteClient } from "@/hooks/useProjects";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { useMediaQuery, BELOW_MD } from "@/hooks/useMediaQuery";
import { groupProjectsByClient } from "@/lib/taskUtils";
import { RailActionsMenu, TaskRailRow } from "./TaskRailRow";
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
      <TaskRailRow
        heading
        active={projectId === null && clientId === null}
        onClick={() => onChange(null)}
        leading={<FolderOpen className="h-4 w-4" aria-hidden />}
        label="All tasks"
        count={totalOpen}
      />

      {groups.map((group) => {
        const client = group.clientId ? clientById.get(group.clientId) : undefined;
        const clientActive = client ? clientId === client.id : false;
        const clientOpenCount = group.projects.reduce((sum, p) => sum + (openCounts.get(p.id) ?? 0), 0);
        const menuKey = (kind: "client" | "project", id: string) => `${kind}:${id}`;
        return (
          <div key={group.clientName ?? "none"}>
            <TaskRailRow
              heading
              active={clientActive}
              onClick={client ? () => onClientChange(clientActive ? null : client.id) : undefined}
              onContextMenu={(e) => {
                if (!canManage || !client) return;
                e.preventDefault();
                setOpenMenu(menuKey("client", client.id));
              }}
              leading={<Users className="h-4 w-4" aria-hidden />}
              label={group.clientName ?? "No client"}
              count={client ? clientOpenCount : undefined}
              actions={
                canManage && client ? (
                  <RailActionsMenu
                    label={client.name}
                    open={openMenu === menuKey("client", client.id)}
                    onOpenChange={(o) => setOpenMenu(o ? menuKey("client", client.id) : null)}
                    onEdit={() => setEditClient(client)}
                    onArchive={() => setArchiveClient(client)}
                  />
                ) : undefined
              }
            />
            <div className="mt-0.5 space-y-0.5">
              {group.projects.map((project) => (
                <TaskRailRow
                  key={project.id}
                  active={projectId === project.id}
                  onClick={() => onChange(project.id)}
                  onContextMenu={(e) => {
                    if (!canManage) return;
                    e.preventDefault();
                    setOpenMenu(menuKey("project", project.id));
                  }}
                  leading={<ColorDot color={project.color} />}
                  label={project.name}
                  count={openCounts.get(project.id) ?? 0}
                  actions={
                    canManage ? (
                      <RailActionsMenu
                        label={project.name}
                        open={openMenu === menuKey("project", project.id)}
                        onOpenChange={(o) => setOpenMenu(o ? menuKey("project", project.id) : null)}
                        onEdit={() => setEditProject(project)}
                        onArchive={() => setArchiveProject(project)}
                      />
                    ) : undefined
                  }
                />
              ))}
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
