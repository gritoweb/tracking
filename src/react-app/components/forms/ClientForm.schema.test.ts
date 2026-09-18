import { describe, expect, it } from "vitest";
import { clientFormSchema } from "./ClientForm.schema";

describe("clientFormSchema", () => {
  it("rejects a blank name with the schema's own message", () => {
    const result = clientFormSchema.safeParse({
      name: "",
      email: "",
      phone: "",
      address: "",
      notes: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["name"]);
      expect(result.error.issues[0].message).toMatch(/>=1|at least 1/i);
    }
  });

  it("rejects a malformed email with the schema's own message", () => {
    const result = clientFormSchema.safeParse({
      name: "Acme",
      email: "not-an-email",
      phone: "",
      address: "",
      notes: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(["email"]);
    }
  });

  it("accepts every optional field left blank", () => {
    const result = clientFormSchema.safeParse({
      name: "Acme",
      email: "",
      phone: "",
      address: "",
      notes: "",
    });
    expect(result.success).toBe(true);
  });

  it("parses a fully filled form", () => {
    const result = clientFormSchema.safeParse({
      name: "Acme",
      email: "hi@acme.test",
      phone: "555-1234",
      address: "1 Main St",
      notes: "Pays net-30",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        name: "Acme",
        email: "hi@acme.test",
        phone: "555-1234",
        address: "1 Main St",
        notes: "Pays net-30",
      });
    }
  });
});
