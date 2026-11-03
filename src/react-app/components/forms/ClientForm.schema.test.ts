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
      rate: null,
      currency: null,
      billing: "hourly",
      fixedFee: null,
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
      rate: null,
      currency: null,
      billing: "hourly",
      fixedFee: null,
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
      rate: null,
      currency: null,
      billing: "hourly",
      fixedFee: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a rate that isn't a number", () => {
    const result = clientFormSchema.safeParse({ name: "Acme", email: "", phone: "", address: "", notes: "", rate: NaN, currency: null, billing: "hourly", fixedFee: null });
    expect(result.success).toBe(false);
  });

  it("rejects a negative rate", () => {
    const result = clientFormSchema.safeParse({ name: "Acme", email: "", phone: "", address: "", notes: "", rate: -1, currency: null, billing: "hourly", fixedFee: null });
    expect(result.success).toBe(false);
  });

  it("parses a fully filled form", () => {
    const result = clientFormSchema.safeParse({
      name: "Acme",
      email: "hi@acme.test",
      phone: "555-1234",
      address: "1 Main St",
      notes: "Pays net-30",
      rate: 80,
      currency: "USD",
      billing: "hourly",
      fixedFee: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({
        name: "Acme",
        email: "hi@acme.test",
        phone: "555-1234",
        address: "1 Main St",
        notes: "Pays net-30",
        rate: 80,
        currency: "USD",
        billing: "hourly",
        fixedFee: null,
      });
    }
  });

  it("requires the amount when the client is billed a fixed fee", () => {
    const base = { name: "Acme", email: "", phone: "", address: "", notes: "", rate: null, currency: null, billing: "fixed" as const };
    const missing = clientFormSchema.safeParse({ ...base, fixedFee: null });
    expect(missing.success).toBe(false);
    if (!missing.success) expect(missing.error.issues[0].path).toEqual(["fixedFee"]);
    expect(clientFormSchema.safeParse({ ...base, fixedFee: 1000 }).success).toBe(true);
  });
});
