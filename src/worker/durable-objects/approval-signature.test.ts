import { describe, expect, it } from "vitest";
import { applyChunkToParts } from "agents/chat";

// ChatAgent signs every tool approval (experimental_toolApprovalSecret, SECURITY.md S-02) and the AI SDK refuses to run an
// approved tool whose stored approval has no signature. agents@0.17.4 dropped it when persisting the approval request, so an
// approval executed from the stored conversation failed with "missing signature" and the action silently never ran. The fix
// is patches/agents@0.17.4.patch; this fails if an upgrade brings the old builder back.
describe("a persisted tool-approval request keeps its signature", () => {
  it("copies the signature from the approval-request chunk onto the stored part", () => {
    const parts: Record<string, unknown>[] = [
      { type: "tool-move_task", toolCallId: "call-1", state: "input-available", input: { taskId: "t1", statusId: "s1" } },
    ];
    applyChunkToParts(parts as never, {
      type: "tool-approval-request",
      toolCallId: "call-1",
      approvalId: "approval-1",
      signature: "signed-by-the-server",
    } as never);
    expect(parts[0]).toMatchObject({
      state: "approval-requested",
      approval: { id: "approval-1", signature: "signed-by-the-server" },
    });
  });
});
