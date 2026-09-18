import { forwardRef, type ReactNode, type ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

/**
 * One field on its own line in the stacked card — an icon and a label/value, opening whatever
 * wraps it. Forwards its ref and every prop a Radix `asChild` trigger (Popover, MultiSelect,
 * ProjectPicker) injects — onClick included — or the click that's meant to open it does nothing.
 */
export const TaskFieldRow = forwardRef<
  HTMLButtonElement,
  { icon: ReactNode; label: string; muted?: boolean } & ComponentPropsWithoutRef<"button">
>(({ icon, label, muted, className, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      "flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs",
      "transition-colors duration-fast ease-out-quart hover:bg-accent",
      muted ? "text-muted-foreground" : "text-foreground",
      className
    )}
    {...props}
  >
    <span className="text-muted-foreground">{icon}</span>
    {label}
  </button>
));
TaskFieldRow.displayName = "TaskFieldRow";
