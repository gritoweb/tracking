import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface SettingsRowProps {
  htmlFor?: string;
  label: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Label + description on the left, a control on the right — stacks below sm. */
export function SettingsRow({ htmlFor, label, description, children, className }: SettingsRowProps) {
  return (
    <div className={cn("flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between", className)}>
      <div className="pr-2">
        <Label htmlFor={htmlFor}>{label}</Label>
        {description && (
          <p className="mt-1 text-xs leading-normal text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}
