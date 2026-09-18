import { describe, expect, it } from "vitest";
import { entryUrl, taskUrl } from "./links";

const base = "https://app.example.test";

describe("tool result links", () => {
  it("points a task at its tab", () => {
    expect(taskUrl(base, "t1")).toBe(`${base}/tasks/t1`);
    expect(taskUrl(base, "t1", "comments")).toBe(`${base}/tasks/t1/comments`);
  });

  it("points an entry at the Timer on its day", () => {
    expect(entryUrl(base, "2026-09-18T13:00:00.000Z")).toBe(`${base}/?date=2026-09-18`);
  });
});
