import { useState } from "react";
import { Edit2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SettingsListItem } from "@/components/settings/SettingsListItem";
import { useClientServices, useSaveClientService } from "@/hooks/useProjects";
import { formatCurrency } from "@/lib/currency";
import { useUIStore } from "@/stores/uiStore";
import type { ClientService } from "@shared/schemas";

/** A client's fixed services (hosting, email…); the billable ones are listed on its invoice. */
export function ClientServicesSection({ clientId, canManage }: { clientId: string; canManage: boolean }) {
  const { data: services = [] } = useClientServices(clientId);
  const save = useSaveClientService(clientId);
  const currency = useUIStore((s) => s.currency);
  const [editing, setEditing] = useState<ClientService | "new" | null>(null);
  const [removing, setRemoving] = useState<ClientService | null>(null);

  return (
    <div className="mb-6 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Fixed services</h2>
        {canManage && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing("new")}>
            <Plus className="h-3.5 w-3.5" />
            Add service
          </Button>
        )}
      </div>

      {services.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No fixed services. Hosting, email and other recurring charges added here go on the invoice when billable.
        </p>
      ) : (
        <div className="space-y-1.5">
          {services.map((s) => (
            <SettingsListItem
              key={s.id}
              title={
                <>
                  <span className="font-medium">{s.name}</span>
                  <span className="tabular-nums text-muted-foreground">{formatCurrency(s.amount, currency)}</span>
                  {!s.billable && <span className="text-xs text-muted-foreground">Not billable</span>}
                </>
              }
              subtitle={s.description || undefined}
            >
              {canManage && (
                <div className="flex shrink-0 items-center gap-1">
                  <Switch
                    checked={s.billable}
                    aria-label={`Bill ${s.name} on the invoice`}
                    onCheckedChange={(billable) =>
                      save.mutate({ kind: "update", serviceId: s.id, data: { billable } })
                    }
                  />
                  <Button variant="ghost" size="icon-sm" aria-label="Edit service" title="Edit service" onClick={() => setEditing(s)}>
                    <Edit2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label="Remove service" title="Remove service" onClick={() => setRemoving(s)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </SettingsListItem>
          ))}
        </div>
      )}

      {editing && (
        <ServiceDialog
          service={editing === "new" ? undefined : editing}
          pending={save.isPending}
          onClose={() => setEditing(null)}
          onSave={(data) =>
            save.mutate(
              editing === "new"
                ? { kind: "create", data }
                : { kind: "update", serviceId: editing.id, data },
              { onSuccess: () => setEditing(null) }
            )
          }
        />
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Remove this service?"
        description={`${removing?.name ?? ""} will no longer be listed for this client.`}
        confirmLabel="Remove"
        onConfirm={() => {
          if (removing) save.mutate({ kind: "delete", serviceId: removing.id });
          setRemoving(null);
        }}
      />
    </div>
  );
}

interface ServiceDraft {
  name: string;
  description: string | null;
  amount: number;
  billable: boolean;
}

function ServiceDialog({
  service,
  pending,
  onClose,
  onSave,
}: {
  service?: ClientService;
  pending: boolean;
  onClose: () => void;
  onSave: (data: ServiceDraft) => void;
}) {
  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [amount, setAmount] = useState(service?.amount.toString() ?? "");
  const [billable, setBillable] = useState(service?.billable ?? true);
  const amountValue = Number(amount);
  const valid = name.trim() !== "" && amount !== "" && amountValue >= 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{service ? "Edit service" : "New service"}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4 py-2"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onSave({ name: name.trim(), description: description.trim() || null, amount: amountValue, billable });
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="service-name">Name</Label>
            <Input id="service-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Email server" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="service-description">Description</Label>
            <Textarea id="service-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="service-amount">Amount</Label>
              <Input
                id="service-amount"
                type="number"
                min={0}
                step={0.01}
                className="w-32"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 pb-2">
              <Switch id="service-billable" checked={billable} onCheckedChange={setBillable} />
              <Label htmlFor="service-billable" className="font-normal">Billable</Label>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!valid || pending}>{service ? "Save changes" : "Add service"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
