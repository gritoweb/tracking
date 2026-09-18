// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { QuickAddTaskInlineView } from "./QuickAddTaskInlineView";

function view(overrides: Partial<React.ComponentProps<typeof QuickAddTaskInlineView>> = {}) {
  const props: React.ComponentProps<typeof QuickAddTaskInlineView> = {
    bare: true,
    placeholder: "Add a subtask",
    value: "",
    onValueChange: () => {},
    onKeyDown: () => {},
    autoFocus: false,
    canSubmit: false,
    onSubmit: vi.fn(),
    showProjectField: false,
    projectId: "p1",
    onProjectChange: () => {},
    manualDueDate: null,
    dueOpen: false,
    onDueOpenChange: () => {},
    onManualDueDateChange: () => {},
    members: [],
    assigneeIds: [],
    onAssigneeIdsChange: () => {},
    parsed: { name: "", dueDate: null, priority: null, projectHint: null } as unknown as React.ComponentProps<typeof QuickAddTaskInlineView>["parsed"],
    hinted: undefined,
    dueDate: null,
    effectiveProjectId: "p1",
    hasAnyProject: true,
    ...overrides,
  };
  return { props, ...render(<QuickAddTaskInlineView {...props} />) };
}

describe("QuickAddTaskInlineView", () => {
  it("adds what is typed when the + is clicked", () => {
    const { props } = view({ value: "Write tests", canSubmit: true });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("puts the cursor in the field, and adds nothing, when the + is clicked with no name", () => {
    const { props } = view();
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(props.onSubmit).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Add a task" }));
  });

  it("keeps the assign button visible without a hover", () => {
    view();
    expect(screen.getByRole("button", { name: "Add assignee" })).not.toHaveClass("tt-reveal");
  });
});
