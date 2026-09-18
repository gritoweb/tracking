import { cva } from "class-variance-authority"

// `tone` formalizes the budget-ladder pairs three callers hand-rolled via `className` (DESIGN.md §8).
export const progressVariants = cva("relative h-2 w-full overflow-hidden rounded-full", {
  variants: {
    tone: {
      default: "bg-border",
      success: "bg-success/15",
      warning: "bg-warning/20",
      destructive: "bg-destructive/20",
    },
  },
  defaultVariants: {
    tone: "default",
  },
})

export const progressIndicatorVariants = cva(
  "h-full w-full flex-1 transition-all duration-base ease-out-quart",
  {
    variants: {
      tone: {
        default: "bg-foreground",
        success: "bg-success",
        warning: "bg-warning",
        destructive: "bg-destructive",
      },
    },
    defaultVariants: {
      tone: "default",
    },
  }
)
