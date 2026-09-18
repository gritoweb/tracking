import { useForm } from "react-hook-form";
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

  const form = useForm<ClientFormValues>({
    resolver: zodResolver(clientFormSchema),
    defaultValues: {
      name: client?.name ?? "",
      email: client?.email ?? "",
      phone: client?.phone ?? "",
      address: client?.address ?? "",
      notes: client?.notes ?? "",
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    const data = {
      name: values.name.trim(),
      email: values.email.trim() || null,
      phone: values.phone.trim() || null,
      address: values.address.trim() || null,
      notes: values.notes.trim() || null,
    };

    if (client) {
      updateClient.mutate({ id: client.id, data }, { onSuccess: onClose });
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
