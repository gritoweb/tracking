import * as React from "react"
import { Trash2, type LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface RemoveButtonProps extends React.ComponentProps<"button"> {
  "aria-label": string
  icon?: LucideIcon
}

// Hover-revealed delete inside a menu row; tt-reveal already stays visible on touch/keyboard.
const RemoveButton = React.forwardRef<HTMLButtonElement, RemoveButtonProps>(
  ({ className, "aria-label": ariaLabel, icon: Icon = Trash2, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      data-slot="remove-button"
      aria-label={ariaLabel}
      title={ariaLabel}
      className={cn(
        "tt-reveal hit-area focus-ring inline-flex shrink-0 items-center justify-center rounded p-0.5 text-muted-foreground transition-colors duration-fast ease-out-quart hover:text-destructive [&_svg]:size-3.5 [&_svg]:pointer-events-none",
        className
      )}
      {...props}
    >
      <Icon aria-hidden="true" />
    </button>
  )
)
RemoveButton.displayName = "RemoveButton"

export { RemoveButton }
