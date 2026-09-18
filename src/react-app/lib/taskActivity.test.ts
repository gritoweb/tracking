import { describe, expect, it } from "vitest";
import type { TaskActivity } from "@shared/schemas";
import { describeActivity } from "./taskActivity";

const base: TaskActivity = {
  id: "a1", taskId: "t1", userId: "u1", userName: "Luis", userImage: null,
  kind: "status", from: null, to: null, createdAt: "2026-09-18T12:00:00Z",
};
const sentence = (a: Partial<TaskActivity>) => describeActivity({ ...base, ...a }).map((s) => s.text).join("");

describe("describeActivity", () => {
  it("describes a status change, with and without a previous status", () => {
    expect(sentence({ kind: "status", from: "To do", to: "In progress" })).toBe("changed status from To do to In progress");
    expect(sentence({ kind: "status", from: null, to: "Backlog" })).toBe("set status to Backlog");
  });

  it("emphasises only the values", () => {
    const strong = describeActivity({ ...base, kind: "status", from: "To do", to: "Done" }).filter((s) => s.strong).map((s) => s.text);
    expect(strong).toEqual(["To do", "Done"]);
  });

  it("describes due dates, including removing one", () => {
    expect(sentence({ kind: "due_date", from: null, to: "2026-09-25" })).toBe("set the due date to 25 Sep 2026");
    expect(sentence({ kind: "due_date", from: "2026-09-25", to: "2026-10-02" })).toBe("changed the due date from 25 Sep 2026 to 2 Oct 2026");
    expect(sentence({ kind: "due_date", from: "2026-09-25", to: null })).toBe("removed the due date");
  });

  it("names priorities instead of numbers", () => {
    expect(sentence({ kind: "priority", from: "4", to: "1" })).toBe("changed priority from None to Urgent");
  });

  it("describes added and removed assignees together or alone", () => {
    expect(sentence({ kind: "assignees", from: null, to: "Ana" })).toBe("assigned Ana");
    expect(sentence({ kind: "assignees", from: "Ana", to: null })).toBe("unassigned Ana");
    expect(sentence({ kind: "assignees", from: "Ana", to: "Bo" })).toBe("assigned Bo and unassigned Ana");
  });
});
