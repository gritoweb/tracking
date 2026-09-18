// @vitest-environment jsdom
import { useEffect } from "react";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { useForm, FormProvider } from "react-hook-form";

import { Field, FieldLabel, FieldMessage } from "@/components/forms/Field";

function Wrapper({ error }: { error?: string }) {
  const form = useForm({ defaultValues: { name: "" } });
  useEffect(() => {
    if (error) form.setError("name", { type: "manual", message: error });
  }, [error, form]);
  return (
    <FormProvider {...form}>
      <Field>
        <FieldLabel htmlFor="name">Name</FieldLabel>
        <input id="name" {...form.register("name")} />
        <FieldMessage name="name" />
      </Field>
    </FormProvider>
  );
}

function NestedWrapper() {
  const form = useForm({ defaultValues: { credentials: { apiKey: "" } } });
  useEffect(() => {
    form.setError("credentials.apiKey", { type: "manual", message: "String must contain at least 1 character(s)" });
  }, [form]);
  return (
    <FormProvider {...form}>
      <FieldMessage name="credentials.apiKey" />
    </FormProvider>
  );
}

describe("Field", () => {
  it("renders nothing when the named field has no error", () => {
    render(<Wrapper />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the field's own error message", async () => {
    render(<Wrapper error="Choose a client" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Choose a client");
  });

  it("resolves a nested dotted path like credentials.apiKey", async () => {
    render(<NestedWrapper />);
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "String must contain at least 1 character(s)"
    );
  });
});
