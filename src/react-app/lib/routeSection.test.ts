import { describe, expect, it } from "vitest";
import { routeSection } from "./routeSection";

describe("routeSection", () => {
  it("is the first path segment", () => {
    expect(routeSection("/tasks")).toBe("tasks");
    expect(routeSection("/tasks/abc")).toBe("tasks");
    expect(routeSection("/tasks/abc/comments")).toBe("tasks");
    expect(routeSection("/clients/42")).toBe("clients");
  });

  it("is the same for a task and its comments tab, so switching tabs does not remount the page", () => {
    expect(routeSection("/tasks/abc")).toBe(routeSection("/tasks/abc/comments"));
  });

  it("names the root route and ignores trailing slashes", () => {
    expect(routeSection("/")).toBe("/");
    expect(routeSection("")).toBe("/");
    expect(routeSection("/reports/")).toBe("reports");
  });
});
