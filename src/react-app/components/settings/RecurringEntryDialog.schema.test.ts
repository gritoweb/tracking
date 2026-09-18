// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { recurringFormSchema } from "./RecurringEntryDialog.schema";

const base = {
  description: "Daily standup",
  projectId: "project-1",
  taskId: null,
  tags: [],
  billable: true,
  durationMinutes: 30,
  days: [1, 2, 3, 4, 5],
  time: "09:00",
};

describe("recurringFormSchema", () => {
  it("requires a project", () => {
    const result = recurringFormSchema.safeParse({ ...base, projectId: null });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.find((i) => i.path[0] === "projectId")?.message).toBe(
        "Choose a project"
      );
    }
  });

  it("requires at least one day, with daysOfWeek's own message", () => {
    const result = recurringFormSchema.safeParse({ ...base, days: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "days")).toBe(true);
    }
  });

  it("rejects a duration over the schema's 1440-minute (24h) ceiling", () => {
    const result = recurringFormSchema.safeParse({ ...base, durationMinutes: 1441 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.find((i) => i.path[0] === "durationMinutes")).toBeDefined();
    }
  });

  it("rejects a duration under the schema's 1-minute floor", () => {
    const result = recurringFormSchema.safeParse({ ...base, durationMinutes: 0 });
    expect(result.success).toBe(false);
  });

  it("parses a valid submission", () => {
    const result = recurringFormSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.projectId).toBe("project-1");
      expect(result.data.durationMinutes).toBe(30);
    }
  });
});
