import { cva } from "class-variance-authority"

// `size` matches SelectTrigger/Switch's sm|default duality, which Input was missing.
export const inputVariants = cva(
  "w-full min-w-0 rounded-full border border-input bg-transparent px-4 text-base transition-[color,box-shadow] duration-fast ease-out-quart outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      size: {
        default: "h-9 py-1",
        sm: "h-8 py-0.5",
      },
      variant: {
        default: "",
        // Sits on a surface that is already the frame: no fill, border or shadow of its own. dark:bg-transparent is part of it because the base's dark fill would otherwise beat bg-transparent.
        bare: "border-0 bg-transparent shadow-none dark:bg-transparent",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
    },
  }
)
