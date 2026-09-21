import { describe, expect, it } from "vitest";
import { appPath } from "./appPath";

describe("appPath", () => {
  it("keeps in-app paths and turns same-origin URLs into paths", () => {
    expect(appPath("/tasks/t1", "https://app.test")).toBe("/tasks/t1");
    expect(appPath("https://app.test/tasks/t1/comments?x=1", "https://app.test")).toBe("/tasks/t1/comments?x=1");
  });

  it("refuses other origins, protocol-relative and non-URL values", () => {
    expect(appPath("https://evil.test/tasks/t1", "https://app.test")).toBeNull();
    expect(appPath("//evil.test/x", "https://app.test")).toBeNull();
    expect(appPath("javascript:alert(1)", "https://app.test")).toBeNull();
  });

  // A backslash-disguised path must resolve to no other origin — SECURITY.md S-06.
  it("refuses a backslash disguised as an in-app path (resolves to another origin)", () => {
    expect(appPath("/\\evil.test/x", "https://app.test")).toBeNull();
    expect(appPath("/\\\\evil.test/x", "https://app.test")).toBeNull();
    expect(appPath("\\/evil.test/x", "https://app.test")).toBeNull();
  });
});
