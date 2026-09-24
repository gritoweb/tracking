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
        // Sits on a surface that is already the frame: no fill, border, shadow or ring. dark:bg-transparent beats the base's dark fill.
        // rounded-md + px-2, never the pill with px-0: Chrome clips an input's text to its rounded box, cutting the first letters.
        bare: "rounded-md border-0 bg-transparent px-2 shadow-none focus-visible:ring-0 dark:bg-transparent",
      },
      focusRing: {
        outset: "",
        // A borderless field's only focus signal (WCAG 2.4.7); the house outset ring would draw outside a 0-border field.
        inset: "focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset",
      },
    },
    defaultVariants: {
      size: "default",
      variant: "default",
      focusRing: "outset",
    },
  }
)
