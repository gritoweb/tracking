import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { SettingsHint } from "@/components/settings/SettingsHint";
import { IntegrationForm } from "./IntegrationForm";
import { useDeleteIntegration } from "@/hooks/useIntegrations";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import type { Integration, IntegrationType } from "@shared/schemas";

const LABELS: Record<IntegrationType, string> = {
  workfront: "Adobe Workfront",
  dynamics: "Microsoft Dynamics 365",
};

/** A time-push partner's connections (one per client system), edited inline — the tile already said which system. */
export function ConnectionsPanel({ type, connections }: { type: IntegrationType; connections: Integration[] }) {
  const { canManage } = useWorkspaceRole();
  const deleteIntegration = useDeleteIntegration();
  // null = no form open; "new" = adding; otherwise the connection being edited.
  const [editing, setEditing] = useState<Integration | "new" | null>(connections.length ? null : "new");
  const [deleteTarget, setDeleteTarget] = useState<Integration | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">{LABELS[type]}</span>
        {canManage && editing === null && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" />
            Add connection
          </Button>
        )}
      </div>
      <SettingsHint>
        Push tracked time into the client's {LABELS[type]}. Assign a connection to a project from the project settings.
        {!canManage && " Only workspace owners and admins can add or change connections."}
      </SettingsHint>

      {connections.length > 0 && (
        <ul className="divide-y rounded-md border">
          {connections.map((integration) => (
            <li key={integration.id} className="flex items-center gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{integration.name}</p>
                <p className="truncate text-xs text-muted-foreground">{integration.baseUrl}</p>
              </div>
              {canManage && (
                <>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="shrink-0"
                    onClick={() => setEditing(integration)}
                    aria-label={`Edit ${integration.name}`}
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="shrink-0 text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(integration)}
                    disabled={deleteIntegration.isPending}
                    aria-label={`Remove ${integration.name}`}
                    title="Remove"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && editing !== null && (
        <div className="rounded-md border p-4">
          <IntegrationForm
            // Remount per target so switching from one connection to another resets the fields.
            key={editing === "new" ? "new" : editing.id}
            type={type}
            integration={editing === "new" ? undefined : editing}
            onClose={() => setEditing(null)}
          />
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Remove connection?"
        description={`"${deleteTarget?.name}" will be disconnected. Projects using it will stop pushing time entries.`}
        confirmLabel="Remove"
        onConfirm={() => {
          if (deleteTarget) deleteIntegration.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}
