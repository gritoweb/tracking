import { describe, expect, it } from "vitest";
import { DEFAULT_ENTRY_BILLABLE, resolveEntryBillable } from "./billable";

describe("resolveEntryBillable", () => {
  it("defaults to billable when nothing is said", () => {
    expect(resolveEntryBillable(undefined)).toBe(true);
    expect(resolveEntryBillable()).toBe(true);
    expect(DEFAULT_ENTRY_BILLABLE).toBe(true);
  });

  it("defaults to billable for a null signal too", () => {
    expect(resolveEntryBillable(null)).toBe(true);
  });

  it("an explicit false always wins over the default", () => {
    expect(resolveEntryBillable(false)).toBe(false);
  });

  it("an explicit true is unaffected", () => {
    expect(resolveEntryBillable(true)).toBe(true);
  });
});
