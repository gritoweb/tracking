import * as React from "react"
import type { VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { numericVariants } from "@/components/ui/numeric-variants"
import { formatDurationShort, formatSeconds } from "@/lib/dateUtils"

interface NumericProps
  extends React.ComponentProps<"span">,
    VariantProps<typeof numericVariants> {}

/** Right-aligned tabular-nums Geist Mono for any number in a list or column (DESIGN.md §3, §8). */
const Numeric = React.forwardRef<HTMLSpanElement, NumericProps>(
  ({ className, size, weight, tone, ...props }, ref) => (
    <span
      ref={ref}
      data-slot="numeric"
      className={cn(numericVariants({ size, weight, tone }), className)}
      {...props}
    />
  )
)
Numeric.displayName = "Numeric"

interface DurationProps extends Omit<NumericProps, "children"> {
  seconds: number
  /** "short" -> formatDurationShort ("1h 30m"); "clock" -> formatSeconds ("01:30:00"). */
  format?: "short" | "clock"
}

const Duration = React.forwardRef<HTMLSpanElement, DurationProps>(
  ({ seconds, format = "short", ...props }, ref) => (
    <Numeric ref={ref} data-slot="duration" {...props}>
      {format === "clock" ? formatSeconds(seconds) : formatDurationShort(seconds)}
    </Numeric>
  )
)
Duration.displayName = "Duration"

export { Numeric, Duration }
