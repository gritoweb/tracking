import { describe, expect, it } from "vitest";
import { CreateFavoriteSchema, CreateRecurringEntrySchema } from "./schemas";

describe("CreateFavoriteSchema billable default", () => {
  it("parses to billable when the payload omits it", () => {
    const parsed = CreateFavoriteSchema.parse({});
    expect(parsed.billable).toBe(true);
  });

  it("keeps an explicit false", () => {
    const parsed = CreateFavoriteSchema.parse({ billable: false });
    expect(parsed.billable).toBe(false);
  });
});

describe("CreateRecurringEntrySchema billable default", () => {
  const base = {
    projectId: "project-1",
    durationSeconds: 3600,
    daysOfWeek: [1],
    timeUtcMinutes: 540,
  };

  it("parses to billable when the payload omits it", () => {
    const parsed = CreateRecurringEntrySchema.parse(base);
    expect(parsed.billable).toBe(true);
  });

  it("keeps an explicit false", () => {
    const parsed = CreateRecurringEntrySchema.parse({ ...base, billable: false });
    expect(parsed.billable).toBe(false);
  });
});
