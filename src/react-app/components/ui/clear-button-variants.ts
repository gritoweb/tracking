import { cva } from "class-variance-authority"

export const clearButtonVariants = cva(
  "hit-area focus-ring inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors duration-fast ease-out-quart hover:text-foreground focus-visible:text-foreground [&_svg]:pointer-events-none",
  {
    variants: {
      size: {
        xs: "[&_svg]:size-2.5",
        sm: "[&_svg]:size-3",
      },
    },
    defaultVariants: {
      size: "xs",
    },
  }
)
