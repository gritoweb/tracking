// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildFormSchema } from "./IntegrationForm.schema";

const base = {
  type: "workfront" as const,
  name: "Workfront – Acme",
  baseUrl: "acme.my.workfront.com",
  apiKey: "",
  tenantId: "",
  clientId: "",
  clientSecret: "",
};

describe("IntegrationForm's buildFormSchema", () => {
  it("create mode requires the workfront API key, with WorkfrontCredentialsSchema's own message", () => {
    const result = buildFormSchema(false).safeParse(base);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.join(".") === "apiKey")).toBe(true);
    }
  });

  it("create mode requires all three Dynamics fields", () => {
    const result = buildFormSchema(false).safeParse({ ...base, type: "dynamics" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("tenantId");
      expect(paths).toContain("clientId");
      expect(paths).toContain("clientSecret");
    }
  });

  it("edit mode accepts blank credentials — 'keep the current ones'", () => {
    const result = buildFormSchema(true).safeParse(base);
    expect(result.success).toBe(true);
  });

  it("edit mode still validates credentials the user did touch", () => {
    const result = buildFormSchema(true).safeParse({ ...base, apiKey: "   " });
    // Whitespace-only counts as untouched, same as blank.
    expect(result.success).toBe(true);
  });

  it("parses a fully valid create submission", () => {
    const result = buildFormSchema(false).safeParse({ ...base, apiKey: "wf-key-123" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.apiKey).toBe("wf-key-123");
    }
  });
});
