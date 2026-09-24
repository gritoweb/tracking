import * as React from "react"
import type { VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { slotButtonVariants } from "@/components/ui/slot-button-variants"

interface SlotButtonProps extends React.ComponentProps<"button">, VariantProps<typeof slotButtonVariants> {
  "aria-label": string
}

/** An empty field waiting to be filled (assignee, due date): one dashed circle for all of them, so they match. */
function SlotButton({ className, size, reveal, title, "aria-label": ariaLabel, ...props }: SlotButtonProps) {
  return (
    <button
      type="button"
      data-slot="slot-button"
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
      className={cn(slotButtonVariants({ size, reveal }), className)}
      {...props}
    />
  )
}

export { SlotButton }
