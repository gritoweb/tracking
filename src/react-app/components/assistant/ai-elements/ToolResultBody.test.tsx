// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { linksOf, renderToolResult } from "./ToolResultBody";

describe("linksOf", () => {
  it("reads the url of one item, labelled by its name or description", () => {
    expect(linksOf({ id: "t1", name: "Write docs", url: "https://app.test/tasks/t1" })).toEqual([
      { label: "Write docs", url: "https://app.test/tasks/t1" },
    ]);
    expect(linksOf({ description: "test 123", url: "https://app.test/?date=2026-09-18" })[0].label).toBe("test 123");
  });

  it("reads every row of a list, capped so a long list does not flood the card", () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({ name: `T${i}`, url: `https://app.test/tasks/${i}` }));
    expect(linksOf(rows)).toHaveLength(5);
  });

  it("ignores items with no url, refusals and non-objects", () => {
    expect(linksOf({ ok: false, reason: "nope" })).toEqual([]);
    expect(linksOf([{ name: "no link" }, null, "text"])).toEqual([]);
    expect(linksOf(undefined)).toEqual([]);
  });
});

describe("renderToolResult", () => {
  it("shows a link to the task a catalog tool touched", () => {
    render(<MemoryRouter>{renderToolResult("create_task", {}, { name: "Write docs", url: `${window.location.origin}/tasks/t1` })}</MemoryRouter>);
    expect(screen.getByRole("link", { name: "Write docs" }).getAttribute("href")).toBe("/tasks/t1");
  });
});
