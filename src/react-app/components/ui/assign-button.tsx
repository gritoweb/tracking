import * as React from "react"
import { UserPlus } from "lucide-react"
import type { VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { assignButtonVariants } from "@/components/ui/assign-button-variants"

interface AssignButtonProps
  extends Omit<React.ComponentProps<"button">, "children">,
    VariantProps<typeof assignButtonVariants> {}

function AssignButton({
  className,
  size,
  reveal,
  "aria-label": ariaLabel = "Add assignee",
  title = "Add assignee",
  ...props
}: AssignButtonProps) {
  return (
    <button
      type="button"
      data-slot="assign-button"
      aria-label={ariaLabel}
      title={title}
      className={cn(assignButtonVariants({ size, reveal }), className)}
      {...props}
    >
      <UserPlus />
    </button>
  )
}

export { AssignButton }
