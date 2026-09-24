import { AlertTriangle, X } from "lucide-react";
import { getToolPartState, getToolInput, getToolOutput } from "@cloudflare/ai-chat/react";
import { ToolResultCard } from "./ToolResultCard";
import { renderToolResult } from "./ToolResultBody";
import { ToolApprovalPrompt } from "./ToolApprovalPrompt";
import { toolMetaFor, toolNameOf, type ToolPart } from "./toolMeta";

type Rec = Record<string, unknown>;

export function ToolCard({
  part,
  onApprove,
  settled,
}: {
  part: ToolPart;
  onApprove: (id: string, approved: boolean) => void;
  /** The turn is over: nothing more will arrive for this card. */
  settled: boolean;
}) {
  const name = toolNameOf(part);
  const meta = toolMetaFor(name);
  const state = getToolPartState(part);
  const input = (getToolInput(part) as Rec | undefined) ?? {};
  const output = (getToolOutput(part) as Rec | undefined) ?? {};

  if (state === "loading" || state === "streaming") {
    return <ToolResultCard spin title={<span className="text-muted-foreground">{meta.label}…</span>} />;
  }
  if (state === "error") {
    return <ToolResultCard icon={AlertTriangle} tone="error" title={`${meta.label} failed`} />;
  }
  if (state === "waiting-approval") {
    return (
      <ToolResultCard icon={meta.icon} tone="warn" title={meta.label}>
        <ToolApprovalPrompt part={part} name={name} input={input} onApprove={onApprove} />
      </ToolResultCard>
    );
  }
  // Approved but never ran, and the turn is over: say so, or the chat reads as if it happened.
  if (state === "approved" && settled) {
    return <ToolResultCard icon={AlertTriangle} tone="error" title={`${meta.label} was approved but didn't run — ask again to retry`} />;
  }
  if (state === "denied") {
    return <ToolResultCard icon={X} tone="muted" title={`${meta.label} — declined`} />;
  }

  return <>{renderToolResult(name, input, output)}</>;
}
