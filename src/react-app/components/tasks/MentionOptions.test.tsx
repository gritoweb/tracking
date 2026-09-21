// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MentionOptions } from "./MentionOptions";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";

const member = (userId: string, name: string, email: string): WorkspaceMember => ({ userId, name, email, image: null, role: "member" });

describe("MentionOptions", () => {
  it("shows only the name when every name in the list is different", () => {
    render(<MentionOptions items={[member("u-1", "Ana", "ana@x.test"), member("u-2", "Bo", "bo@x.test")]} active={0} onPick={() => {}} />);
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(screen.queryByText("ana@x.test")).toBeNull();
    expect(screen.queryByText("bo@x.test")).toBeNull();
  });

  it("adds the e-mail to the rows whose name repeats, and only to those", () => {
    render(
      <MentionOptions
        items={[member("u-1", "Sam", "sam.one@x.test"), member("u-2", "Sam", "sam.two@x.test"), member("u-3", "Bo", "bo@x.test")]}
        active={0}
        onPick={() => {}}
      />
    );
    expect(screen.getByText("sam.one@x.test")).toBeTruthy();
    expect(screen.getByText("sam.two@x.test")).toBeTruthy();
    expect(screen.queryByText("bo@x.test")).toBeNull();
  });

  it("picks the exact person of a repeated name, by id", () => {
    const onPick = vi.fn();
    render(<MentionOptions items={[member("u-1", "Sam", "sam.one@x.test"), member("u-2", "Sam", "sam.two@x.test")]} active={0} onPick={onPick} />);
    fireEvent.mouseDown(screen.getByText("sam.two@x.test").closest("button")!);
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ userId: "u-2" }));
  });
});
