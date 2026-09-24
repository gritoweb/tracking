import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/** When one answer asks for several actions, one click decides them all; each card below still shows what it does. */
export function ApprovalBatchBar({ ids, onApprove }: { ids: string[]; onApprove: (id: string, approved: boolean) => void }) {
  if (ids.length < 2) return null;
  const decide = (approved: boolean) => ids.forEach((id) => onApprove(id, approved));
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-sm">
      <span className="mr-auto">{ids.length} actions are waiting for you</span>
      <Button size="sm" variant="destructive" onClick={() => decide(true)}>
        <Check className="h-3.5 w-3.5" /> Approve all
      </Button>
      <Button size="sm" variant="outline" onClick={() => decide(false)}>
        <X className="h-3.5 w-3.5" /> Deny all
      </Button>
    </div>
  );
}
