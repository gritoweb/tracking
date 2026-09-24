import { describe, expect, it } from "vitest";
import { endedMidTask } from "./turnState";
import type { ToolPart } from "./toolMeta";

const tool = (state: string) => ({ type: "tool-list_task_statuses", toolCallId: "c", state, input: {}, output: [] }) as unknown as ToolPart;
const text = { type: "text", text: "Moved it." } as unknown as ToolPart;
const step = { type: "step-start" } as unknown as ToolPart;

describe("endedMidTask", () => {
  it("is true when the answer stopped right after a tool result", () => {
    expect(endedMidTask([step, text, step, tool("output-available"), step])).toBe(true);
  });

  it("is false when the answer ended by saying something", () => {
    expect(endedMidTask([step, tool("output-available"), step, text])).toBe(false);
  });

  it("is false while an approval is pending (that card asks for the next move)", () => {
    expect(endedMidTask([step, tool("approval-requested")])).toBe(false);
  });
});
