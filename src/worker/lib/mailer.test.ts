import { describe, expect, it } from "vitest";
import { shouldDeliver } from "./mailer";

const PROD = "https://app.company-placeholder.io";

describe("shouldDeliver", () => {
  it("delivers from the deployed app to a real address", () => {
    expect(shouldDeliver(PROD, "someone@company-placeholder.io")).toBe(true);
  });

  it("never delivers from a local dev server, even to a real address", () => {
    expect(shouldDeliver("http://localhost:5173", "someone@company-placeholder.io")).toBe(false);
    expect(shouldDeliver("http://127.0.0.1:5173", "someone@company-placeholder.io")).toBe(false);
  });

  it("never delivers to reserved test domains, even from production", () => {
    for (const to of [
      "invitee-1@outsider.test",
      "demo@example.com",
      "a@example.org",
      "a@foo.example",
      "a@nowhere.invalid",
      "a@box.localhost",
    ]) {
      expect(shouldDeliver(PROD, to), to).toBe(false);
    }
  });

  it("fails closed when the app URL is missing or malformed", () => {
    expect(shouldDeliver(undefined, "someone@company-placeholder.io")).toBe(false);
    expect(shouldDeliver("not a url", "someone@company-placeholder.io")).toBe(false);
  });

  it("does not mistake a real domain that merely contains a reserved word", () => {
    expect(shouldDeliver(PROD, "a@testing.com")).toBe(true);
    expect(shouldDeliver(PROD, "a@myexample.com")).toBe(true);
  });
});
