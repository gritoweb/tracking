import { cva } from "class-variance-authority"

// Selection is an outline (never `ring`, reserved for focus everywhere else — DESIGN.md §5).
export const colorSwatchButtonVariants = cva(
  "relative flex shrink-0 items-center justify-center rounded-full outline-2 outline-offset-2 outline-transparent transition-transform duration-fast ease-out-quart hit-area focus-ring",
  {
    variants: {
      size: {
        sm: "h-5 w-5",
        md: "h-6 w-6",
      },
      selected: {
        true: "scale-110 outline-foreground",
        false: "hover:scale-105",
      },
    },
    defaultVariants: {
      size: "md",
      selected: false,
    },
  }
)
