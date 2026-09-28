import { cva } from "class-variance-authority"

// A choice among a few rich options (an integration partner): the Card's tonal step as its ground, so it reads inside a
// Card without a border. Selection is an outline, never a ring — ring means focus (DESIGN.md §5), same as the swatches.
export const tileButtonVariants = cva(
  "flex w-full min-w-0 flex-col items-start gap-2 rounded-container bg-background p-4 text-left outline-2 -outline-offset-2 outline-transparent transition-colors duration-fast ease-out-quart hover:bg-accent/40 focus-ring",
  {
    variants: {
      selected: {
        true: "outline-foreground",
        false: "",
      },
    },
    defaultVariants: {
      selected: false,
    },
  }
)
