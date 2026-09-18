import { NEUTRAL_SWATCH } from "@shared/colors";
import { cn } from "@/lib/utils";

/** Fallback swatch color for entities without an assigned color. */
export const DEFAULT_PROJECT_COLOR = NEUTRAL_SWATCH;

interface ColorDotProps {
  color?: string | null;
  className?: string;
}

/** A small round color swatch used for projects, tags, and legends. */
export function ColorDot({ color, className }: ColorDotProps) {
  return (
    <span
      className={cn("h-2.5 w-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: color ?? DEFAULT_PROJECT_COLOR }}
    />
  );
}
