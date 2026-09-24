import { cva } from "class-variance-authority"

// Dashed Rule (DESIGN.md §5): dashed border means empty, click to fill — never a "can't" signal.
export const slotButtonVariants = cva(
  "inline-flex shrink-0 items-center justify-center rounded-full border border-dashed transition-colors duration-fast ease-out-quart hit-area outline-none focus-ring hover:border-muted-foreground hover:text-muted-foreground",
  {
    variants: {
      // `hover` (default) is for dense rows and cards, where an empty slot would be noise; `always` is for a row whose main job is to fill it (a quick-add).
      reveal: {
        hover: "tt-reveal border-muted-foreground/50 text-muted-foreground/50",
        always: "border-muted-foreground text-muted-foreground",
      },
      size: {
        xs: "h-5 w-5 [&_svg]:size-3",
        sm: "h-6 w-6 [&_svg]:size-3.5",
        md: "h-8 w-8 [&_svg]:size-4",
      },
    },
    defaultVariants: {
      size: "xs",
      reveal: "hover",
    },
  }
)
