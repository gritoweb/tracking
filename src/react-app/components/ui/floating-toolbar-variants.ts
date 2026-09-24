import { cva } from "class-variance-authority"

// A toolbar that floats over content (the editor's selection bar): an overlay, so it carries the overlay shadow.
export const floatingToolbarVariants = cva(
  "z-tooltip flex flex-col gap-1 rounded-container border bg-popover p-1 text-popover-foreground shadow-md"
)
