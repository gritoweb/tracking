import { cva } from "class-variance-authority"

// DESIGN.md §3 "Mono/Data": 500 weight is the mono floor, so there is no "normal" step here.
export const numericVariants = cva("font-mono tabular-nums text-right", {
  variants: {
    size: {
      xs: "text-xs",
      sm: "text-sm",
    },
    weight: {
      medium: "font-medium",
      semibold: "font-semibold",
    },
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
    },
  },
  defaultVariants: {
    size: "sm",
    weight: "medium",
    tone: "default",
  },
})
