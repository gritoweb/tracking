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
    },
    defaultVariants: {
      tone: "default",
    },
  }
)
