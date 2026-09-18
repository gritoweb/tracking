import { Check, X } from "lucide-react";
import { getToolApproval } from "@cloudflare/ai-chat/react";
import { Button } from "@/components/ui/button";
import type { ToolPart } from "./toolMeta";

type Rec = Record<string, unknown>;

export function ToolApprovalPrompt({
  part,
  name,
  input,
  onApprove,
}: {
  part: ToolPart;
  name: string;
  input: Rec;
  onApprove: (id: string, approved: boolean) => void;
}) {
  const approval = getToolApproval(part);
  if (!approval?.id) return null;

  // Show the salient inputs so the user approves the actual action — not just a
  // tool name — and can catch an injected/incorrect entry before it's written.
  const details: string[] = [];
  const desc = input.description ?? input.title ?? input.content;
  if (typeof desc === "string" && desc.trim()) details.push(`“${desc.trim()}”`);
  if (typeof input.projectName === "string" && input.projectName.trim()) details.push(String(input.projectName));
  if (typeof input.start === "string" && typeof input.stop === "string") {
    details.push(`${new Date(input.start).toLocaleString()} → ${new Date(input.stop).toLocaleString()}`);
  }
  if (typeof input.billable === "boolean") details.push(input.billable ? "billable" : "non-billable");

  return (
    <div className="space-y-2">
      <p>
        The assistant wants to run <span className="font-medium text-foreground">{name}</span>
        {input.id ? ` on entry ${String(input.id).slice(0, 8)}…` : ""}. Approve?
      </p>
      {details.length > 0 && (
        <p className="rounded bg-muted/60 px-2 py-1 text-xs text-muted-foreground">{details.join(" · ")}</p>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" onClick={() => onApprove(approval.id, true)}>
          <Check className="h-3.5 w-3.5" /> Approve
        </Button>
        <Button size="sm" variant="outline" onClick={() => onApprove(approval.id, false)}>
          <X className="h-3.5 w-3.5" /> Deny
        </Button>
      </div>
    </div>
  );
}
