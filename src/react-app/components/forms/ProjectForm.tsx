import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FieldLabel, FieldMessage } from "@/components/forms/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { ColorSwatchPicker } from "@/components/ui/color-swatch-picker";
import {
  useCreateProject,
  useUpdateProject,
  useClients,
  useCreateClient,
  useProjects,
} from "@/hooks/useProjects";
import { ClientField } from "@/components/projects/ClientField";
import { NO_CLIENT, hasClient, resolveClientId, type ClientChoice } from "@/lib/clientChoice";
import { useIntegrations } from "@/hooks/useIntegrations";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { useUIStore } from "@/stores/uiStore";
import { nextUnusedColor, randomColor } from "@/lib/colorUtils";
import { cn } from "@/lib/utils";
import { projectFormSchema, type ProjectFormValues } from "./ProjectForm.schema";
import type { Project } from "@shared/schemas";

interface ProjectFormProps {
  project?: Project;
  open: boolean;
  onClose: () => void;
}

export function ProjectForm({ project, open, onClose }: ProjectFormProps) {
  const autoAssignColors = useUIStore((s) => s.autoAssignColors);
  const { data: existingProjects = [] } = useProjects();
  const { data: clients = [] } = useClients();
  const { data: integrations = [] } = useIntegrations();
  // Rates, budgets, dates and integrations are set by owners/admins; the server ignores them from a member (D3).
  const { canManage } = useWorkspaceRole();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const createClient = useCreateClient();
  const isPending = createProject.isPending || updateProject.isPending || createClient.isPending;

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      name: project?.name ?? "",
      // New projects get a distinct color when auto-assign is on; the user can still
      // override it below. Editing keeps the project's existing color.
      color:
        project?.color ??
        (autoAssignColors
          ? nextUnusedColor(existingProjects.map((p) => p.color))
          : randomColor()),
      client: project?.clientId
        ? ({ clientId: project.clientId, newName: "" } satisfies ClientChoice)
        : NO_CLIENT,
      rate: project?.rate?.toString() ?? "",
      startDate: project?.startDate ?? "",
      endDate: project?.endDate ?? "",
      estimatedHours: project?.estimatedHours?.toString() ?? "",
      integrationId: project?.integrationId ?? "none",
      externalProjectId: project?.externalProjectId ?? "",
      externalTaskId: project?.externalTaskId ?? "",
    },
  });

  const client = useWatch({ control: form.control, name: "client" });
  const integrationId = useWatch({ control: form.control, name: "integrationId" });
  const externalProjectId = useWatch({ control: form.control, name: "externalProjectId" });
  const externalTaskId = useWatch({ control: form.control, name: "externalTaskId" });
  const selectedIntegration = integrations.find((i) => i.id === integrationId);

  // Dynamics always requires a project ID; Workfront requires a project or task ID.
  const integrationMissingRequiredId =
    selectedIntegration?.type === "dynamics"
      ? !externalProjectId.trim()
      : selectedIntegration?.type === "workfront"
        ? !externalProjectId.trim() && !externalTaskId.trim()
        : false;

  const onSubmit = form.handleSubmit(async (values) => {
    const clientId = await resolveClientId(values.client, clients, createClient.mutateAsync);
    const data = {
      name: values.name,
      color: values.color,
      clientId,
      // Unused by any entry path now (see docs/ARCHITECTURE.md) — just preserve it.
      billable: project?.billable ?? true,
      rate: values.rate ? parseFloat(values.rate) : null,
      startDate: values.startDate || null,
      endDate: values.endDate || null,
      estimatedHours: values.estimatedHours ? parseFloat(values.estimatedHours) : null,
      integrationId: values.integrationId === "none" ? null : values.integrationId,
      externalProjectId: values.integrationId === "none" ? null : values.externalProjectId || null,
      externalTaskId: values.integrationId === "none" ? null : values.externalTaskId || null,
    };

    if (project) {
      updateProject.mutate({ id: project.id, data }, { onSuccess: onClose });
    } else {
      createProject.mutate(data, { onSuccess: onClose });
    }
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{project ? "Edit Project" : "New Project"}</DialogTitle>
        </DialogHeader>

        <form className="space-y-4 py-2" onSubmit={onSubmit} noValidate>
          <Field>
            <FieldLabel htmlFor="project-name">Name</FieldLabel>
            <Input id="project-name" {...form.register("name")} placeholder="Project name" autoFocus />
            <FieldMessage name="name" />
          </Field>

          <Field>
            <FieldLabel>Color</FieldLabel>
            <Controller
              control={form.control}
              name="color"
              render={({ field }) => (
                <ColorSwatchPicker value={field.value} onChange={field.onChange} aria-label="Project color" />
              )}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="project-client">Client</FieldLabel>
            <Controller
              control={form.control}
              name="client"
              render={({ field }) => (
                <ClientField id="project-client" value={field.value} onChange={field.onChange} clients={clients} />
              )}
            />
            <FieldMessage name="client" />
          </Field>

          {canManage && (
            <div className="flex gap-3">
              <Field className="flex-1">
                <FieldLabel htmlFor="project-start">Start date</FieldLabel>
                <Input id="project-start" type="date" {...form.register("startDate")} />
              </Field>
              <Field className="flex-1">
                <FieldLabel htmlFor="project-end">End date</FieldLabel>
                <Input id="project-end" type="date" {...form.register("endDate")} />
              </Field>
            </div>
          )}

          {canManage && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <FieldLabel htmlFor="project-rate" className="shrink-0 text-sm text-muted-foreground">
                  Rate
                </FieldLabel>
                <Input
                  id="project-rate"
                  type="number"
                  placeholder="0.00"
                  className="w-24 text-sm"
                  min={0}
                  step={0.01}
                  {...form.register("rate")}
                />
                <span className="text-sm text-muted-foreground">/h</span>
              </div>

              <div className="flex items-center gap-3">
                <FieldLabel htmlFor="project-estimated" className="shrink-0 text-sm text-muted-foreground">
                  Estimated hours
                </FieldLabel>
                <Input
                  id="project-estimated"
                  type="number"
                  placeholder="0"
                  className="w-28 text-sm"
                  min={0}
                  step={0.5}
                  {...form.register("estimatedHours")}
                />
              </div>
            </div>
          )}

          {canManage && integrations.length > 0 && (
            <div className="space-y-3 border-t pt-4">
              <Field>
                <FieldLabel htmlFor="project-integration">Integration</FieldLabel>
                <Controller
                  control={form.control}
                  name="integrationId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
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
                  )}
                />
                <p className="text-xs text-muted-foreground">
                  Push this project's time entries to an external system.
                </p>
              </Field>

              {selectedIntegration && (
                <div className="space-y-2">
                  <div className="flex gap-3">
                    <Field className="flex-1">
                      <FieldLabel className="text-xs text-muted-foreground">
                        {selectedIntegration.type === "workfront" ? "Workfront project ID" : "Dynamics project ID"}
                      </FieldLabel>
                      <Input
                        placeholder={selectedIntegration.type === "workfront" ? "optional if task set" : "GUID (required)"}
                        className="text-sm"
                        {...form.register("externalProjectId")}
                      />
                    </Field>
                    <Field className="flex-1">
                      <FieldLabel className="text-xs text-muted-foreground">
                        {selectedIntegration.type === "workfront" ? "Workfront task ID" : "Dynamics task ID"}
                      </FieldLabel>
                      <Input placeholder="optional" className="text-sm" {...form.register("externalTaskId")} />
                    </Field>
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button
              type="submit"
              disabled={!hasClient(client) || isPending || integrationMissingRequiredId}
            >
              {project ? "Save changes" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
