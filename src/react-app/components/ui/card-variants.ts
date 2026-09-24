import { cva } from "class-variance-authority"

// `tone` replaces DangerZoneCard's `border-destructive/40`, which broke the no-border Flat-By-Default Rule (DESIGN.md §4).
export const cardVariants = cva(
  "flex flex-col rounded-container bg-card text-card-foreground",
  {
    variants: {
      // `compact` is for a card per list item (a comment), where the section padding of `default` would swamp the text.
      size: {
        default: "gap-6 py-6",
        compact: "gap-1.5 px-4 py-3",
      },
      tone: {
        default: "",
        destructive: "bg-destructive/5",
        // On an overlay (dialog, popover): --card equals --popover in dark, so the card would vanish; --muted steps off both.
        muted: "bg-muted",
      },
      interactive: {
        true: "cursor-pointer transition-colors duration-fast ease-out-quart hover:bg-accent/40 active:scale-[0.99]",
        false: "",
      },
    },
    defaultVariants: {
      size: "default",
      tone: "default",
      interactive: false,
    },
  }
)
