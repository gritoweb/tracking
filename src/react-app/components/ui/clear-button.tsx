import * as React from "react"
import { X } from "lucide-react"
import type { VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { clearButtonVariants } from "@/components/ui/clear-button-variants"

interface ClearButtonProps
  extends Omit<React.ComponentProps<"button">, "size">,
    VariantProps<typeof clearButtonVariants> {
  "aria-label": string
}

// The small "x" that clears one chip/value without breaking out of its own rounded-full shape.
const ClearButton = React.forwardRef<HTMLButtonElement, ClearButtonProps>(
  ({ className, size, "aria-label": ariaLabel, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      data-slot="clear-button"
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(clearButtonVariants({ size }), className)}
      {...props}
    >
      <X aria-hidden="true" />
    </button>
  )
)
ClearButton.displayName = "ClearButton"

export { ClearButton }
