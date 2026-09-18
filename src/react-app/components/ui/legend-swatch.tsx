import * as React from "react"

import { cn } from "@/lib/utils"

interface LegendSwatchProps extends React.ComponentProps<"span"> {
  color: string
}

// 2px radius is the chart legend's own step — smaller than any named radius in the Geometry Rule.
const LegendSwatch = React.forwardRef<HTMLSpanElement, LegendSwatchProps>(
  ({ color, className, style, ...props }, ref) => (
    <span
      ref={ref}
      data-slot="legend-swatch"
      className={cn("h-2.5 w-2.5 shrink-0 rounded-[2px]", className)}
      style={{ backgroundColor: color, ...style }}
      {...props}
    />
  )
)
LegendSwatch.displayName = "LegendSwatch"

export { LegendSwatch }
