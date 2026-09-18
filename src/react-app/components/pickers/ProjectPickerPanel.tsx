import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { ClientField } from "@/components/projects/ClientField";
import { hasClient, type ClientChoice } from "@/lib/clientChoice";
import type { Client } from "@shared/schemas";

interface ProjectPickerPanelProps {
  /** The client-less project being linked, or null when creating a new one instead. */
  linkingName: string | null;
  creatingName: string | null;
  onCreatingNameChange: (value: string) => void;
  client: ClientChoice;
  onClientChange: (client: ClientChoice) => void;
  clients: Client[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

/** The two-field panel for linking a client-less project or creating a new one — pure view. */
export function ProjectPickerPanel({
  linkingName,
  creatingName,
  onCreatingNameChange,
  client,
  onClientChange,
  clients,
  pending,
  onCancel,
  onSubmit,
}: ProjectPickerPanelProps) {
  const linking = linkingName !== null;
  return (
    <div className="space-y-3 p-3">
      <p className="-mx-3 border-b px-3 pb-2 text-sm font-medium">
        {linking ? "Link a client" : "New project"}
      </p>
      {linking ? (
        <p className="text-xs leading-normal text-muted-foreground">
          <span className="font-medium text-foreground">{linkingName}</span> has no client yet, and
          time is tracked against a project that has one.
        </p>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="picker-project-name">Project name</Label>
          <Input
            id="picker-project-name"
            value={creatingName ?? ""}
            autoFocus
            onChange={(e) => onCreatingNameChange(e.target.value)}
            // cmdk owns arrows and Enter while its Command is mounted.
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="picker-project-client">Client</Label>
        <ClientField
          id="picker-project-client"
          value={client}
          onChange={onClientChange}
          clients={clients}
          autoFocus={linking}
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="ghost" size="sm" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="flex-1"
          disabled={!hasClient(client) || pending || (!linking && !creatingName?.trim())}
          onClick={onSubmit}
        >
          {pending ? <Spinner size="sm" /> : linking ? "Link and use" : "Create project"}
        </Button>
      </div>
    </div>
  );
}
