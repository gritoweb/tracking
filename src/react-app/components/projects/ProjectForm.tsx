import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateProject,
  useUpdateProject,
  useClients,
  useCreateClient,
  useProjects,
} from "@/hooks/useProjects";
import { ClientField } from "@/components/projects/ClientField";
import {
  NO_CLIENT,
  hasClient,
  resolveClientId,
  type ClientChoice,
} from "@/lib/clientChoice";
import { useIntegrations } from "@/hooks/useIntegrations";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { useUIStore } from "@/stores/uiStore";
import { SWATCH_COLORS, SWATCH_COLOR_NAMES, nextUnusedColor, randomColor } from "@/lib/colorUtils";
import { cn } from "@/lib/utils";
import type { Project } from "@shared/schemas";

interface ProjectFormProps {
  project?: Project;
  open: boolean;
  onClose: () => void;
}

export function ProjectForm({ project, open, onClose }: ProjectFormProps) {
  const autoAssignColors = useUIStore((s) => s.autoAssignColors);
  const { data: existingProjects = [] } = useProjects();
  const [name, setName] = useState(project?.name ?? "");
  // New projects get a distinct color when auto-assign is on; the user can still
  // override it below. Editing keeps the project's existing color.
  const [color, setColor] = useState(
    () =>
      project?.color ??
      (autoAssignColors
        ? nextUnusedColor(existingProjects.map((p) => p.color))
        : randomColor())
  );
  const [client, setClient] = useState<ClientChoice>(
    project?.clientId ? { clientId: project.clientId, newName: "" } : NO_CLIENT
  );
  // Rates, budgets, dates and integrations are set by owners/admins; the server ignores them from a member (D3).
  const { canManage } = useWorkspaceRole();
  const [rate, setRate] = useState<string>(project?.rate?.toString() ?? "");
  const [startDate, setStartDate] = useState(project?.startDate ?? "");
  const [endDate, setEndDate] = useState(project?.endDate ?? "");
  const [estimatedHours, setEstimatedHours] = useState<string>(
    project?.estimatedHours?.toString() ?? ""
  );
  const [integrationId, setIntegrationId] = useState<string>(
    project?.integrationId ?? "none"
  );
  const [externalProjectId, setExternalProjectId] = useState(
    project?.externalProjectId ?? ""
  );
  const [externalTaskId, setExternalTaskId] = useState(
    project?.externalTaskId ?? ""
  );
  const { data: clients = [] } = useClients();
  const { data: integrations = [] } = useIntegrations();
  const selectedIntegration = integrations.find((i) => i.id === integrationId);
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const createClient = useCreateClient();

  const isPending = createProject.isPending || updateProject.isPending || createClient.isPending;

  // Dynamics always requires a project ID; Workfront requires a project or task ID.
  const integrationMissingRequiredId =
    selectedIntegration?.type === "dynamics"
      ? !externalProjectId.trim()
      : selectedIntegration?.type === "workfront"
        ? !externalProjectId.trim() && !externalTaskId.trim()
        : false;

  const handleSave = async () => {
    const clientId = await resolveClientId(client, clients, createClient.mutateAsync);
    const data = {
      name,
      color,
      clientId,
      // Unused by any entry path now (see docs/ARCHITECTURE.md) — just preserve it.
      billable: project?.billable ?? true,
      rate: rate ? parseFloat(rate) : null,
      startDate: startDate || null,
      endDate: endDate || null,
      estimatedHours: estimatedHours ? parseFloat(estimatedHours) : null,
      integrationId: integrationId === "none" ? null : integrationId,
      externalProjectId: integrationId === "none" ? null : externalProjectId || null,
      externalTaskId: integrationId === "none" ? null : externalTaskId || null,
    };

    if (project) {
      updateProject.mutate({ id: project.id, data }, { onSuccess: onClose });
    } else {
      createProject.mutate(data, { onSuccess: onClose });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{project ? "Edit Project" : "New Project"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project name"
              autoFocus
            />
          </div>

          {/* Color */}
          <div className="space-y-1.5">
            <Label>Color</Label>
            <div className="flex flex-wrap gap-2">
              {SWATCH_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Select color ${SWATCH_COLOR_NAMES[c] ?? c}`}
                  aria-pressed={color === c}
                  title={SWATCH_COLOR_NAMES[c] ?? c}
                  className={cn(
                    // Selection and focus use different CSS properties on
                    // purpose. Both used to be `ring-*`, so a swatch that was
                    // selected *and* focused resolved by source order rather
                    // than intent — and the selection ring was a 2px
                    // full-opacity one that also drifted from the house focus
                    // vocabulary. Selection is now an outline, leaving `ring`
                    // to mean focus and only focus, everywhere.
                    "h-6 w-6 rounded-full outline-offset-2 transition-all duration-fast ease-out-quart focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    color === c
                      ? "scale-110 outline-2 outline-foreground"
                      : "outline-none hover:scale-105"
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
          </div>

          {/* Client */}
          <div className="space-y-1.5">
            <Label htmlFor="project-client">Client</Label>
            <ClientField
              id="project-client"
              value={client}
              onChange={setClient}
              clients={clients}
            />
          </div>

          {/* Date range */}
          {canManage && (
          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label>Start date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label>End date</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          )}

          {/* Rate + estimated hours */}
          {canManage && (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <Label htmlFor="project-rate" className="shrink-0 text-sm text-muted-foreground">Rate</Label>
              <Input
                id="project-rate"
                type="number"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
                placeholder="0.00"
                className="w-24 text-sm"
                min={0}
                step={0.01}
              />
              <span className="text-sm text-muted-foreground">/h</span>
            </div>

            <div className="flex items-center gap-3">
              <Label className="shrink-0 text-sm text-muted-foreground">Estimated hours</Label>
              <Input
                type="number"
                value={estimatedHours}
                onChange={(e) => setEstimatedHours(e.target.value)}
                placeholder="0"
                className="w-28 text-sm"
                min={0}
                step={0.5}
              />
            </div>
          </div>
          )}

          {/* Integration */}
          {canManage && integrations.length > 0 && (
            <div className="space-y-3 border-t pt-4">
              <div className="space-y-1.5">
                <Label htmlFor="project-integration">Integration</Label>
                <Select value={integrationId} onValueChange={setIntegrationId}>
                  <SelectTrigger id="project-integration">
                    <SelectValue placeholder="No integration" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No integration</SelectItem>
                    {integrations.map((i) => (
                      <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Push this project's time entries to an external system.
                </p>
              </div>

              {selectedIntegration && (
                <div className="space-y-2">
                  <div className="flex gap-3">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        {selectedIntegration.type === "workfront" ? "Workfront project ID" : "Dynamics project ID"}
                      </Label>
                      <Input
                        value={externalProjectId}
                        onChange={(e) => setExternalProjectId(e.target.value)}
                        placeholder={selectedIntegration.type === "workfront" ? "optional if task set" : "GUID (required)"}
                        className="text-sm"
                      />
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs text-muted-foreground">
                        {selectedIntegration.type === "workfront" ? "Workfront task ID" : "Dynamics task ID"}
                      </Label>
                      <Input
                        value={externalTaskId}
                        onChange={(e) => setExternalTaskId(e.target.value)}
                        placeholder="optional"
                        className="text-sm"
                      />
                    </div>
                  </div>
                  <p
                    className={cn(
                      "text-xs",
                      integrationMissingRequiredId ? "text-destructive" : "text-muted-foreground"
                    )}
                  >
                    {integrationMissingRequiredId
                      ? selectedIntegration.type === "workfront"
                        ? "Set a project ID or a task ID before saving."
                        : "A project ID is required for Dynamics."
                      : selectedIntegration.type === "workfront"
                        ? "Time logs against the task ID when set, otherwise the project ID."
                        : "Project ID is required (a Dataverse GUID). Task ID is optional."}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || !hasClient(client) || isPending || integrationMissingRequiredId}
          >
            {project ? "Save changes" : "Create project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
