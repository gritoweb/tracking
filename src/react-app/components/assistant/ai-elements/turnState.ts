import type { ToolPart } from "./toolMeta";

/**
 * The answer ended on a tool's result with nothing said after it: the step cap (ChatAgent's MAX_STEPS) stopped it mid-task,
 * so the chat must say it stopped rather than sit there looking finished.
 */
export function endedMidTask(parts: readonly ToolPart[]): boolean {
  const last = [...parts].reverse().find((p) => p.type !== "step-start");
  if (!last || typeof last.type !== "string" || !last.type.startsWith("tool-")) return false;
  return "state" in last && last.state === "output-available";
}
