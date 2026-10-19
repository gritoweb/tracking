import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Field, FieldLabel, FieldMessage } from "@/components/forms/Field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useCreateClient, useUpdateClient } from "@/hooks/useProjects";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { useReportSettings } from "@/hooks/useReportSettings";
import { currencyLocale, formatMoneyInput } from "@/lib/money";
import { MoneyInput } from "./MoneyInput";
import { SettingsHint } from "@/components/settings/SettingsHint";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CURRENCIES } from "@/lib/currency";
import { clientFormSchema, type ClientFormValues } from "./ClientForm.schema";
import type { Client } from "@shared/schemas";

interface ClientFormProps {
  client?: Client;
  open: boolean;
  onClose: () => void;
}

export function ClientForm({ client, open, onClose }: ClientFormProps) {
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const isPending = createClient.isPending || updateClient.isPending;
  // The rate is an owner/admin edit (the server refuses a member), so it lives on the edit form only.
  const { canManage } = useWorkspaceRole();
  const showRate = Boolean(client) && canManage;
  const { data: reportSettings } = useReportSettings();
  // Radix Select has no empty value, so "Workspace default" needs a token of its own.
  const WORKSPACE_CURRENCY = "workspace";

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      name: client?.name ?? "",
      email: client?.email ?? "",
      phone: client?.phone ?? "",
      address: client?.address ?? "",
      notes: client?.notes ?? "",
      rate: client?.rate ?? null,
      currency: client?.currency ?? null,
    },
  });

  const currency = useWatch({ control: form.control, name: "currency" }) ?? reportSettings?.currency ?? "";

  const onSubmit = form.handleSubmit((values) => {
    const data = {
      name: values.name.trim(),
      email: values.email.trim() || null,
      phone: values.phone.trim() || null,
      address: values.address.trim() || null,
      notes: values.notes.trim() || null,
    };

    if (client) {
      const rate = showRate ? { rate: values.rate, currency: values.currency } : {};
      updateClient.mutate({ id: client.id, data: { ...data, ...rate } }, { onSuccess: onClose });
    } else {
      createClient.mutate(data, { onSuccess: onClose });
    }
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{client ? "Edit Client" : "New Client"}</DialogTitle>
        </DialogHeader>

        <form className="space-y-4 py-2" onSubmit={onSubmit} noValidate>
          <Field>
            <FieldLabel htmlFor="client-name">Name</FieldLabel>
            <Input id="client-name" {...form.register("name")} placeholder="Client name" autoFocus />
            <FieldMessage name="name" />
          </Field>

          <div className="flex gap-3">
            <Field className="flex-1">
              <FieldLabel htmlFor="client-email">Email</FieldLabel>
              <Input id="client-email" type="email" {...form.register("email")} placeholder="name@example.com" />
              <FieldMessage name="email" />
            </Field>
            <Field className="flex-1">
              <FieldLabel htmlFor="client-phone">Phone</FieldLabel>
              <Input id="client-phone" type="tel" {...form.register("phone")} placeholder="(555) 123-4567" />
              <FieldMessage name="phone" />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="client-address">Address</FieldLabel>
            <Textarea id="client-address" {...form.register("address")} placeholder="Street, city, country" rows={2} />
            <FieldMessage name="address" />
          </Field>

          <Field>
            <FieldLabel htmlFor="client-notes">Notes</FieldLabel>
            <Textarea
              id="client-notes"
              {...form.register("notes")}
              placeholder="Anything worth remembering about this client"
              rows={3}
            />
            <FieldMessage name="notes" />
          </Field>

          {showRate && reportSettings && (
            <div className="space-y-1.5">
              <div className="flex gap-3">
                <Field className="flex-1">
                  <FieldLabel htmlFor="client-rate">Hourly rate</FieldLabel>
                  <Controller
                    control={form.control}
                    name="rate"
                    render={({ field }) => (
                      <MoneyInput
                        // Another currency re-reads the amount in that currency's format.
                        key={currency}
                        id="client-rate"
                        currency={currency}
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder={formatMoneyInput(reportSettings.defaultRate, currencyLocale(currency))}
                      />
                    )}
                  />
                </Field>
                <Field className="flex-1">
                  <FieldLabel htmlFor="client-currency">Currency</FieldLabel>
                  <Controller
                    control={form.control}
                    name="currency"
                    render={({ field }) => (
                      <Select
                        value={field.value ?? WORKSPACE_CURRENCY}
                        onValueChange={(v) => field.onChange(v === WORKSPACE_CURRENCY ? null : v)}
                      >
                        <SelectTrigger id="client-currency" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={WORKSPACE_CURRENCY}>Workspace default ({reportSettings.currency})</SelectItem>
                          {CURRENCIES.map((c) => (
                            <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                </Field>
              </div>
              <SettingsHint>Blank rate and Workspace default use Settings → Reports.</SettingsHint>
              <FieldMessage name="rate" />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {client ? "Save changes" : "Create client"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
