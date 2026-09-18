// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AssistantMarkdown } from "./AssistantMarkdown";

const renderMd = (text: string) =>
  render(
    <MemoryRouter>
      <AssistantMarkdown text={text} />
    </MemoryRouter>
  );

describe("AssistantMarkdown links", () => {
  it("renders a markdown link as an anchor", () => {
    renderMd("Created [Write docs](/tasks/t1) for you");
    expect(screen.getByRole("link", { name: "Write docs" }).getAttribute("href")).toBe("/tasks/t1");
  });

  it("opens an outside https link in a new tab without opener access", () => {
    renderMd("See [docs](https://example.com/a)");
    const link = screen.getByRole("link", { name: "docs" });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("shows a javascript: link as plain text, never a link", () => {
    renderMd("Click [here](javascript:alert(1))");
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(/here/)).toBeTruthy();
  });
});
