import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";

/** One row per field — icon+label on the left, value on the right, the ClickUp reference's own layout. */
export function FieldRow({ icon, label, htmlFor, children }: { icon: ReactNode; label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <Label htmlFor={htmlFor} className="w-32 shrink-0 font-normal text-muted-foreground">
        {icon}
        {label}
      </Label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
