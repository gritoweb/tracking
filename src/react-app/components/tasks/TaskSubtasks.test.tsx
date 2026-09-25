// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { Task } from "@shared/schemas";

vi.mock("./QuickAddTask", () => ({ QuickAddTask: () => null }));

const { TaskSubtasks } = await import("./TaskSubtasks");

const sub = { id: "sub-1", name: "Write copy", active: true, assignees: [] } as unknown as Task;
const parent = { id: "task-1", projectId: "p1", subtaskDone: 0, subtaskTotal: 1 } as unknown as Task;

function setup() {
  const onOpen = vi.fn();
  const onRequestDelete = vi.fn();
  render(<TaskSubtasks task={parent} subtasks={[sub]} onToggle={() => {}} onOpen={onOpen} onRequestDelete={onRequestDelete} />);
  const openMenu = () => {
    const trigger = screen.getByRole("button", { name: "More actions for Write copy" });
    // ArrowDown always opens (pointerdown toggles), so the test doesn't depend on menu state from a previous render.
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
  };
  return { onOpen, onRequestDelete, openMenu };
}

// One menu open per file: after a Radix menu opens in jsdom, a later render's menu no longer opens (not seen in a browser).
describe("TaskSubtasks row menu", () => {
  it("deletes a subtask from its ⋯ menu without opening it, and offers opening it there too", async () => {
    const { onOpen, onRequestDelete, openMenu } = setup();
    openMenu();
    expect(await screen.findByRole("menuitem", { name: "Open subtask" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
    expect(onRequestDelete).toHaveBeenCalledWith(sub);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("marks the row as the hover group, so the menu is revealed when the row is hovered", () => {
    setup();
    // `.tt-reveal` shows on `.group:hover`; a named group (`group/subtask`) never matched it.
    const row = screen.getByRole("button", { name: "More actions for Write copy" }).closest("div.group");
    expect(row).not.toBeNull();
  });
});
