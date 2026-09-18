import * as React from "react";
import { useFormContext, type FieldError, type FieldErrors } from "react-hook-form";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

function Field({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="field" className={cn("space-y-1.5", className)} {...props} />;
}

function FieldLabel({ className, ...props }: React.ComponentProps<typeof Label>) {
  return <Label data-slot="field-label" className={className} {...props} />;
}

// RHF's `errors` is keyed by dotted path segments, not a flat string — "credentials.apiKey" walks two levels.
function getNestedError(errors: FieldErrors, path: string): FieldError | undefined {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc && typeof acc === "object" && key in acc) return (acc as Record<string, unknown>)[key];
    return undefined;
  }, errors) as FieldError | undefined;
}

interface FieldMessageProps extends React.ComponentProps<"p"> {
  /** RHF field path (e.g. "credentials.apiKey") whose error to show — always the schema's own message. */
  name: string;
}

function FieldMessage({ name, className, ...props }: FieldMessageProps) {
  const form = useFormContext();
  const error = form ? getNestedError(form.formState.errors, name) : undefined;
  if (!error?.message) return null;
  return (
    <p
      data-slot="field-message"
      role="alert"
      className={cn("text-xs text-destructive", className)}
      {...props}
    >
      {String(error.message)}
    </p>
  );
}

export { Field, FieldLabel, FieldMessage };
