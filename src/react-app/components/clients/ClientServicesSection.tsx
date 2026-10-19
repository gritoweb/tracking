import { Fragment, useState } from "react";
import { Edit2, Plus, Repeat, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { SettingsCardHeader } from "@/components/settings/SettingsCardHeader";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { EmptyState } from "@/components/ui/empty-state";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { Field, FieldLabel } from "@/components/forms/Field";
import { SettingsRow } from "@/components/settings/SettingsRow";
import { useClientServices, useSaveClientService } from "@/hooks/useProjects";
import { useReportSettings } from "@/hooks/useReportSettings";
import { currencyLocale, formatMoney, formatMoneyInput } from "@/lib/money";
import { useUIStore } from "@/stores/uiStore";
import type { ClientService } from "@shared/schemas";

/** A client's recurring services (hosting, email…); the billable ones are listed on its invoice. */
export function ClientServicesSection({ clientId, clientCurrency, canManage }: { clientId: string; clientCurrency: string | null; canManage: boolean }) {
  const { data: services = [] } = useClientServices(clientId);
  const save = useSaveClientService(clientId);
  // Services are billed on the invoice, so they read in the documents' currency.
  const displayCurrency = useUIStore((s) => s.currency);
  const workspaceCurrency = useReportSettings().data?.currency;
  const currency = clientCurrency ?? workspaceCurrency ?? displayCurrency;
  const [editing, setEditing] = useState<ClientService | "new" | null>(null);
  const [removing, setRemoving] = useState<ClientService | null>(null);

  return (
    <Card className="mt-8">
      {/* px-4: the project rows' inset above, so this icon and title sit in the dot's and the project name's columns. */}
      <SettingsCardHeader
        className="px-4"
        icon={Repeat}
        title="Recurring services"
        action={
          canManage && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing("new")}>
              <Plus className="h-3.5 w-3.5" />
              Add service
            </Button>
          )
        }
      />
      <CardContent className="px-4">
        {services.length === 0 ? (
          <EmptyState icon={Repeat} title="No recurring services" description="Hosting, email and other recurring charges for this client. The billable ones go on its invoice." />
        ) : (
          <ItemGroup>
            {services.map((s, i) => (
              <Fragment key={s.id}>
                {i > 0 && <ItemSeparator />}
                {/* pl-6 puts each name under the title's text; border-0 drops the transparent 1px that pushed both edges in. */}
                <Item size="sm" className="border-0 pr-0 pl-6">
                  <ItemContent>
                    <ItemTitle>
                      {s.name}
                      {!s.billable && <Badge variant="outline">Not billable</Badge>}
                    </ItemTitle>
                    <ItemDescription>{[formatMoney(s.amount, currency), s.description].filter(Boolean).join(" · ")}</ItemDescription>
                  </ItemContent>
                  {canManage && (
                    <ItemActions>
                      <Switch
                        checked={s.billable}
                        aria-label={`Bill ${s.name} on the invoice`}
                        title="Billable"
                        onCheckedChange={(billable) => save.mutate({ kind: "update", serviceId: s.id, data: { billable } })}
                      />
                      <Button variant="ghost" size="icon-sm" aria-label="Edit service" title="Edit service" onClick={() => setEditing(s)}>
                        <Edit2 />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label="Remove service" title="Remove service" onClick={() => setRemoving(s)}>
                        <Trash2 />
                      </Button>
                    </ItemActions>
                  )}
                </Item>
              </Fragment>
            ))}
          </ItemGroup>
        )}
      </CardContent>

      {editing && (
        <ServiceDialog
          service={editing === "new" ? undefined : editing}
          currency={currency}
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
    </Card>
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
  currency,
  pending,
  onClose,
  onSave,
}: {
  service?: ClientService;
  currency: string;
  pending: boolean;
  onClose: () => void;
  onSave: (data: ServiceDraft) => void;
}) {
  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [amount, setAmount] = useState<number | null>(service?.amount ?? null);
  const [billable, setBillable] = useState(service?.billable ?? true);
  const valid = name.trim() !== "" && amount !== null && amount >= 0;

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
            if (valid) onSave({ name: name.trim(), description: description.trim() || null, amount, billable });
          }}
        >
          <Field>
            <FieldLabel htmlFor="service-name">Name</FieldLabel>
            <Input id="service-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Service name" autoFocus />
          </Field>
          <Field>
            <FieldLabel htmlFor="service-description">Description</FieldLabel>
            <Textarea
              id="service-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Internal note, not shown on the invoice"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="service-amount">Amount</FieldLabel>
            <MoneyInput
              id="service-amount"
              className="w-40"
              currency={currency}
              value={amount}
              onValueChange={setAmount}
              placeholder={formatMoneyInput(0, currencyLocale(currency))}
            />
          </Field>
          <SettingsRow htmlFor="service-billable" label="Billable" description="Listed on this client's invoice">
            <Switch id="service-billable" checked={billable} onCheckedChange={setBillable} />
          </SettingsRow>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={!valid || pending}>{service ? "Save changes" : "Add service"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
