import { cva } from "class-variance-authority"

// Tone only paints the unchecked border; checked/indeterminate always resolve to primary.
export const checkboxVariants = cva(
  "peer inline-flex shrink-0 items-center justify-center rounded border bg-background cursor-pointer transition-colors duration-fast ease-out-quart hit-area outline-none focus-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary/40 data-[state=indeterminate]:text-primary-foreground",
  {
    variants: {
      size: {
        default: "h-4 w-4",
        sm: "size-3.5",
      },
      tone: {
        default:
          "data-[state=unchecked]:border-muted-foreground/40 data-[state=unchecked]:hover:border-primary",
        destructive:
          "data-[state=unchecked]:border-destructive data-[state=unchecked]:hover:border-destructive",
        warning:
          "data-[state=unchecked]:border-warning data-[state=unchecked]:hover:border-warning",
      },
    },
    defaultVariants: {
      size: "default",
      tone: "default",
    },
  }
)
