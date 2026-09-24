import { cva } from "class-variance-authority"

// `tone` replaces DangerZoneCard's `border-destructive/40`, which broke the no-border Flat-By-Default Rule (DESIGN.md §4).
export const cardVariants = cva(
  "flex flex-col rounded-container bg-card text-card-foreground",
  {
    variants: {
      // `compact` is for a card per list item (a comment), where the section padding of `default` would swamp the text.
      size: {
        default: "gap-6 py-6",
        compact: "gap-3 px-5 py-4",
      },
      // `outlined` is a thread entry (a comment): a hairline and a tighter corner on the surface it sits on, instead of a
      // filled block. The one bordered card, kept to threads so the Flat-By-Default Rule (DESIGN.md §4) holds everywhere else.
      look: {
        filled: "",
        outlined: "rounded-lg border bg-transparent transition-colors duration-fast ease-out-quart focus-within:border-ring",
      },
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
      size: "default",
      look: "filled",
      tone: "default",
      interactive: false,
    },
  }
)
