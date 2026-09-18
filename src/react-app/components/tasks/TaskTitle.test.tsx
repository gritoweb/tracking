// @vitest-environment jsdom
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TaskTitle } from "./TaskTitle";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";

const members: WorkspaceMember[] = [
  { userId: "u-ana", name: "Ana", email: "ana@example.test", image: null, role: "member" },
];

function Harness({ initial, onSave = () => {} }: { initial: string; onSave?: () => void }) {
  const [name, setName] = useState(initial);
  return <TaskTitle name={name} onNameChange={setName} onSave={onSave} members={members} />;
}

describe("TaskTitle", () => {
  it("draws a tagged person as a chip while the name is not being edited", () => {
    render(<Harness initial="Revisar com @Ana hoje" />);
    expect(screen.getByRole("button", { name: "@Ana" })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("is a plain field when nobody is tagged", () => {
    render(<Harness initial="Revisar contrato" />);
    expect((screen.getByLabelText("Task name") as HTMLTextAreaElement).value).toBe("Revisar contrato");
  });

  it("opens the profile when the chip is clicked, without starting an edit", async () => {
    render(<Harness initial="Revisar com @Ana" />);
    fireEvent.click(screen.getByRole("button", { name: "@Ana" }));
    expect(await screen.findByText("ana@example.test")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("starts editing, with the caret at the end, when the words are clicked", () => {
    render(<Harness initial="Revisar com @Ana" />);
    fireEvent.click(screen.getByText("Revisar com"));
    const field = screen.getByLabelText("Task name") as HTMLTextAreaElement;
    expect(field.tagName).toBe("TEXTAREA");
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe("Revisar com @Ana".length);
  });

  it("saves and goes back to the chip view when the field loses focus", () => {
    const onSave = vi.fn();
    render(<Harness initial="Revisar com @Ana" onSave={onSave} />);
    fireEvent.click(screen.getByText("Revisar com"));
    fireEvent.blur(screen.getByLabelText("Task name"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "@Ana" })).toBeTruthy();
  });
});
