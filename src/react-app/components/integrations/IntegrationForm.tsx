import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
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
import {
  useCreateIntegration,
  useUpdateIntegration,
  useTestIntegration,
} from "@/hooks/useIntegrations";
import { buildFormSchema, type IntegrationFormValues } from "./IntegrationForm.schema";
import type { CreateIntegration, Integration, IntegrationType } from "@shared/schemas";

interface IntegrationFormProps {
  integration?: Integration;
  open: boolean;
  onClose: () => void;
}

const TYPE_LABELS: Record<IntegrationType, string> = {
  workfront: "Adobe Workfront",
  dynamics: "Microsoft Dynamics 365",
};

const BASE_URL_HINT: Record<IntegrationType, string> = {
  workfront: "e.g. acme.my.workfront.com",
  dynamics: "e.g. https://acme.crm.dynamics.com",
};

export function IntegrationForm({ integration, open, onClose }: IntegrationFormProps) {
  const isEdit = !!integration;
  const [testStatus, setTestStatus] = useState<{ ok: boolean; message: string } | null>(null);

  const createIntegration = useCreateIntegration();
  const updateIntegration = useUpdateIntegration();
  const testIntegration = useTestIntegration();
  const isPending = createIntegration.isPending || updateIntegration.isPending;

  const form = useForm<IntegrationFormValues>({
    resolver: zodResolver(buildFormSchema(isEdit)),
    defaultValues: {
      type: integration?.type ?? "workfront",
      name: integration?.name ?? "",
      baseUrl: integration?.baseUrl ?? "",
      // Credentials are never returned from the server; blank means "keep existing".
      apiKey: "",
      tenantId: "",
      clientId: "",
      clientSecret: "",
    },
  });

  const type = useWatch({ control: form.control, name: "type" });

  const buildCredentials = (values: IntegrationFormValues) => {
    if (values.type === "workfront") {
      return values.apiKey ? { apiKey: values.apiKey } : null;
    }
    if (values.tenantId || values.clientId || values.clientSecret) {
      return { tenantId: values.tenantId, clientId: values.clientId, clientSecret: values.clientSecret };
    }
    return null;
  };

  const onSubmit = form.handleSubmit((values) => {
    const credentials = buildCredentials(values);

    if (isEdit && integration) {
      updateIntegration.mutate(
        {
          id: integration.id,
          data: {
            name: values.name,
            baseUrl: values.baseUrl,
            ...(credentials ? { credentials } : {}),
          },
        },
        { onSuccess: onClose }
      );
    } else {
      // The schema guarantees full credentials here (create requires them).
      createIntegration.mutate(
        { type: values.type, name: values.name, baseUrl: values.baseUrl, credentials } as CreateIntegration,
        { onSuccess: onClose }
      );
    }
  });

  const handleTest = async () => {
    if (!integration) return;
    setTestStatus(null);
    const result = await testIntegration.mutateAsync(integration.id);
    setTestStatus(
      result.ok
        ? { ok: true, message: "Connection successful" }
        : { ok: false, message: result.error ?? "Connection failed" }
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit integration" : "Add integration"}</DialogTitle>
        </DialogHeader>

        <form className="space-y-4 py-2" onSubmit={onSubmit} noValidate>
          {/* Type */}
          <Field>
            <FieldLabel htmlFor="integration-type">System</FieldLabel>
            {isEdit ? (
              <p className="text-sm text-muted-foreground">{TYPE_LABELS[type]}</p>
            ) : (
              <Select value={type} onValueChange={(v) => form.setValue("type", v as IntegrationType)}>
                <SelectTrigger id="integration-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="workfront">{TYPE_LABELS.workfront}</SelectItem>
                  <SelectItem value="dynamics">{TYPE_LABELS.dynamics}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </Field>

          {/* Name */}
          <Field>
            <FieldLabel htmlFor="integration-name">Name</FieldLabel>
            <Input id="integration-name" {...form.register("name")} placeholder="e.g. Workfront – Acme" autoFocus />
            <FieldMessage name="name" />
          </Field>

          {/* Base URL */}
          <Field>
            <FieldLabel htmlFor="integration-base-url">
              {type === "workfront" ? "Workfront domain" : "Organization URL"}
            </FieldLabel>
            <Input
              id="integration-base-url"
              {...form.register("baseUrl")}
              placeholder={BASE_URL_HINT[type]}
              autoComplete="off"
            />
            <FieldMessage name="baseUrl" />
          </Field>

          {/* Credentials */}
          <div className="space-y-2">
            <FieldLabel>Credentials</FieldLabel>
            <p className="text-xs text-muted-foreground">
              {type === "workfront"
                ? "Create an API key in Workfront (Setup → System → API Keys), or reuse your personal API key."
                : "From your Microsoft Entra ID app registration: tenant ID, client ID, and a client secret."}
              {isEdit ? " Leave blank to keep the current credentials." : ""}
            </p>
            {type === "workfront" ? (
              <Field>
                <Input
                  type="password"
                  placeholder="API key"
                  autoComplete="off"
                  {...form.register("apiKey")}
                />
                <FieldMessage name="apiKey" />
              </Field>
            ) : (
              <div className="space-y-2">
                <Field>
                  <Input placeholder="Tenant ID" autoComplete="off" {...form.register("tenantId")} />
                  <FieldMessage name="tenantId" />
                </Field>
                <Field>
                  <Input placeholder="Client ID" autoComplete="off" {...form.register("clientId")} />
                  <FieldMessage name="clientId" />
                </Field>
                <Field>
                  <Input
                    type="password"
                    placeholder="Client secret"
                    autoComplete="off"
                    {...form.register("clientSecret")}
                  />
                  <FieldMessage name="clientSecret" />
                </Field>
              </div>
            )}
          </div>

          {testStatus && (
            <p className={testStatus.ok ? "text-xs text-success-ink" : "text-xs text-destructive"}>
              {testStatus.message}
            </p>
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            {isEdit && (
              <Button
                type="button"
                variant="outline"
                onClick={handleTest}
                disabled={testIntegration.isPending}
                className="mr-auto"
              >
                {testIntegration.isPending ? "Testing…" : "Test connection"}
              </Button>
            )}
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isEdit ? "Save changes" : "Add integration"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
