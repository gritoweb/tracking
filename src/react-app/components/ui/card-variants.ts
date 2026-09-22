import { cva } from "class-variance-authority"

// `tone` replaces DangerZoneCard's `border-destructive/40`, which broke the no-border Flat-By-Default Rule (DESIGN.md §4).
export const cardVariants = cva(
  "flex flex-col gap-6 rounded-container bg-card py-6 text-card-foreground",
  {
    variants: {
      tone: {
        default: "",
        destructive: "bg-destructive/5",
      },
      interactive: {
        true: "cursor-pointer transition-colors duration-fast ease-out-quart hover:bg-accent/40 active:scale-[0.99]",
        false: "",
      },
    },
    defaultVariants: {
      tone: "default",
      interactive: false,
    },
  }
)
