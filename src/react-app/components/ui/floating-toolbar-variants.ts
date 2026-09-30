import { cva } from "class-variance-authority"

// A toolbar that floats over content: an overlay, so it carries the overlay shadow. `stack` is the editor's selection bar; `bar` a list's bulk actions.
export const floatingToolbarVariants = cva(
  "flex gap-1 rounded-container border bg-popover p-1 text-popover-foreground shadow-md",
  {
    variants: {
      layout: {
        stack: "z-tooltip flex-col",
        // Under portal on purpose: the bar's own menus and pickers open above it.
        bar: "z-overlay flex-row items-center",
      },
    },
    defaultVariants: { layout: "stack" },
  }
)
