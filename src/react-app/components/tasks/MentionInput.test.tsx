// @vitest-environment jsdom
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MentionInput } from "./MentionInput";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";

const members: WorkspaceMember[] = [
  { userId: "u-luis", name: "Luis GritoWeb", email: "luis@example.test", image: null, role: "owner" },
  { userId: "u-ana", name: "Ana", email: "ana@example.test", image: null, role: "member" },
  { userId: "u-am", name: "Ana Maria", email: "am@example.test", image: null, role: "member" },
];

function Harness({ onEscape, repeat }: { onEscape?: () => void; repeat?: boolean }) {
  const [value, setValue] = useState("");
  return (
    <div onKeyDown={(e) => e.key === "Escape" && onEscape?.()}>
      <MentionInput aria-label="Comment" value={value} onValueChange={setValue} members={repeat ? [members[0], members[0]] : members} />
    </div>
  );
}

function type(el: HTMLTextAreaElement, text: string) {
  fireEvent.change(el, { target: { value: text, selectionStart: text.length, selectionEnd: text.length } });
}

describe("MentionInput", () => {
  it("lists matching people as soon as @ is typed after a space", async () => {
    render(<Harness />);
    const box = screen.getByLabelText("Comment") as HTMLTextAreaElement;
    type(box, "oi @lu");
    expect(await screen.findByRole("option", { name: /Luis GritoWeb/ })).toBeTruthy();
    expect(screen.queryByRole("option", { name: /^Ana$/ })).toBeNull();
  });

  it("writes the picked name into the text, where the @ was", async () => {
    render(<Harness />);
    const box = screen.getByLabelText("Comment") as HTMLTextAreaElement;
    type(box, "oi @lu");
    fireEvent.mouseDown(await screen.findByRole("option", { name: /Luis GritoWeb/ }).then((li) => li.querySelector("button")!));
    expect(box.value).toBe("oi @Luis GritoWeb ");
  });

  it("picks with Enter and moves with the arrow keys", async () => {
    render(<Harness />);
    const box = screen.getByLabelText("Comment") as HTMLTextAreaElement;
    type(box, "@ana");
    await screen.findAllByRole("option");
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(box.value).toBe("@Ana Maria ");
  });

  it("lists a person once even if the team list repeats them", async () => {
    render(<Harness repeat />);
    const box = screen.getByLabelText("Comment") as HTMLTextAreaElement;
    type(box, "@lu");
    await screen.findByRole("option", { name: /Luis/ });
    expect(screen.getAllByRole("option")).toHaveLength(1);
  });

  it("does not open for an @ inside a word, like an email", () => {
    render(<Harness />);
    const box = screen.getByLabelText("Comment") as HTMLTextAreaElement;
    type(box, "mail ana@lu");
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("closes the list on Escape without letting Escape reach the panel around it", async () => {
    let escaped = false;
    render(<Harness onEscape={() => (escaped = true)} />);
    const box = screen.getByLabelText("Comment") as HTMLTextAreaElement;
    type(box, "@lu");
    await screen.findByRole("option", { name: /Luis/ });
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByRole("option")).toBeNull();
    expect(escaped).toBe(false);
  });
});
