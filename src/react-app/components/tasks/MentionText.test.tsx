// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MentionText } from "./MentionText";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";

const members: WorkspaceMember[] = [
  { userId: "u-luis", name: "Luis GritoWeb", email: "luis@example.test", image: null, role: "owner" },
  { userId: "u-ana", name: "Ana", email: "ana@example.test", image: null, role: "member" },
];

describe("MentionText", () => {
  it("draws a tag as a chip with the member's own name, in the middle of the text", () => {
    render(<MentionText body="oi @[Luis](user:u-luis), tudo bem?" members={members} />);
    expect(screen.getByRole("button", { name: "@Luis GritoWeb" })).toBeTruthy();
    expect(screen.getByText(/oi/)).toBeTruthy();
    expect(screen.getByText(/tudo bem\?/)).toBeTruthy();
  });

  it("shows the person's profile when the chip is clicked", async () => {
    render(<MentionText body="@[x](user:u-ana)" members={members} />);
    fireEvent.click(screen.getByRole("button", { name: "@Ana" }));
    expect(await screen.findByText("ana@example.test")).toBeTruthy();
    expect(screen.getByText("Member")).toBeTruthy();
  });

  it("uses the member's real name even if the tag claims another one", () => {
    render(<MentionText body="@[CEO Bob](user:u-ana)" members={members} />);
    expect(screen.getByRole("button", { name: "@Ana" })).toBeTruthy();
    expect(screen.queryByText(/CEO Bob/)).toBeNull();
  });

  it("shows a tag for someone who is gone as plain text, not a chip", () => {
    render(<MentionText body="ex @[Old Colleague](user:u-gone)" members={members} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("@Old Colleague")).toBeTruthy();
  });
});
