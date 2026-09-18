import { cva } from "class-variance-authority"

// Keeps `rounded-xl`, not the control pill: a pill forces the first/last text lines into the curve (DESIGN.md §5).
export const textareaVariants = cva(
  "flex field-sizing-content min-h-16 w-full rounded-xl border border-input bg-transparent px-3 py-2 text-base transition-[color,box-shadow] duration-fast ease-out-quart outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
  {
    variants: {},
    defaultVariants: {},
  }
)
