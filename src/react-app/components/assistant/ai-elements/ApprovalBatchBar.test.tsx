// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApprovalBatchBar } from "./ApprovalBatchBar";

describe("ApprovalBatchBar", () => {
  it("stays out of the way for a single approval", () => {
    const { container } = render(<ApprovalBatchBar ids={["a"]} onApprove={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("approves every waiting action with one click", () => {
    const onApprove = vi.fn();
    render(<ApprovalBatchBar ids={["a", "b", "c"]} onApprove={onApprove} />);
    expect(screen.getByText("3 actions are waiting for you")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Approve all/ }));
    expect(onApprove.mock.calls).toEqual([["a", true], ["b", true], ["c", true]]);
  });

  it("denies them all with one click", () => {
    const onApprove = vi.fn();
    render(<ApprovalBatchBar ids={["a", "b"]} onApprove={onApprove} />);
    fireEvent.click(screen.getByRole("button", { name: /Deny all/ }));
    expect(onApprove.mock.calls).toEqual([["a", false], ["b", false]]);
  });
});
