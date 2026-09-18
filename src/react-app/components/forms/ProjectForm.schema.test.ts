// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { SWATCH_COLORS } from "@shared/colors";
import { projectFormSchema } from "./ProjectForm.schema";

const validColor = SWATCH_COLORS[0];
const validClient = { clientId: "client-1", newName: "" };

describe("projectFormSchema", () => {
  it("rejects a blank name with the schema's own message", () => {
    const result = projectFormSchema.safeParse({
      name: "",
      color: validColor,
      client: validClient,
      rate: "",
      startDate: "",
      endDate: "",
      estimatedHours: "",
      integrationId: "none",
      externalProjectId: "",
      externalTaskId: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "name")).toBe(true);
    }
  });

  it("rejects a missing client with 'Choose a client'", () => {
    const result = projectFormSchema.safeParse({
      name: "Acme project",
      color: validColor,
      client: { clientId: "", newName: "" },
      rate: "",
      startDate: "",
      endDate: "",
      estimatedHours: "",
      integrationId: "none",
      externalProjectId: "",
      externalTaskId: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Choose a client");
    }
  });

  it("rejects a non-hex color", () => {
    const result = projectFormSchema.safeParse({
      name: "Acme project",
      color: "blue",
      client: validClient,
      rate: "",
      startDate: "",
      endDate: "",
      estimatedHours: "",
      integrationId: "none",
      externalProjectId: "",
      externalTaskId: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "color")).toBe(true);
    }
  });

  it("parses a valid submission, including a newly-named client", () => {
    const result = projectFormSchema.safeParse({
      name: "Acme project",
      color: validColor,
      client: { clientId: "", newName: "Brand new client" },
      rate: "150",
      startDate: "2026-01-01",
      endDate: "",
      estimatedHours: "40",
      integrationId: "none",
      externalProjectId: "",
      externalTaskId: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.client).toEqual({ clientId: "", newName: "Brand new client" });
      expect(result.data.name).toBe("Acme project");
    }
  });
});
