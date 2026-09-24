import { getToolApproval, getToolPartState } from "@cloudflare/ai-chat/react";
import type { ToolPart } from "./toolMeta";

/** The approval ids a message is still waiting on, in the order its cards show them. */
export function pendingApprovalIds(parts: readonly ToolPart[]): string[] {
  return parts.flatMap((part) => {
    if (typeof part.type !== "string" || !part.type.startsWith("tool-")) return [];
    if (getToolPartState(part) !== "waiting-approval") return [];
    const id = getToolApproval(part)?.id;
    return id ? [id] : [];
  });
}
