// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ToolCard } from "./ToolCard";
import type { ToolPart } from "./toolMeta";

const approvedButNotRun = {
  type: "tool-move_task",
  toolCallId: "call-1",
  state: "approval-responded",
  input: { taskId: "t1", statusId: "s1" },
  approval: { id: "approval-1", approved: true },
} as unknown as ToolPart;

describe("ToolCard for an approved action with no result", () => {
  it("says it didn't run once the turn is over, instead of reading as done", () => {
    render(<MemoryRouter><ToolCard part={approvedButNotRun} onApprove={vi.fn()} settled /></MemoryRouter>);
    expect(screen.getByText(/approved but didn't run/)).toBeInTheDocument();
  });

  it("stays quiet while the turn is still running", () => {
    render(<MemoryRouter><ToolCard part={approvedButNotRun} onApprove={vi.fn()} settled={false} /></MemoryRouter>);
    expect(screen.queryByText(/didn't run/)).not.toBeInTheDocument();
  });
});
