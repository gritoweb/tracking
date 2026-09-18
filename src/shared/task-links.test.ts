import { describe, expect, it } from "vitest";
import { parseTaskTab, taskPath } from "./task-links";

describe("task links", () => {
  it("builds the task and comments URLs", () => {
    expect(taskPath("abc")).toBe("/tasks/abc");
    expect(taskPath("abc", "task")).toBe("/tasks/abc");
    expect(taskPath("abc", "comments")).toBe("/tasks/abc/comments");
  });

  it("reads the tab back, defaulting to the task tab", () => {
    expect(parseTaskTab("comments")).toBe("comments");
    expect(parseTaskTab(undefined)).toBe("task");
    expect(parseTaskTab("nonsense")).toBe("task");
  });
});
