import { cva } from "class-variance-authority"

export const avatarVariants = cva(
  "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-primary/10 font-medium text-primary-ink",
  {
    variants: {
      size: {
        xs: "h-5 w-5 text-micro",
        sm: "h-6 w-6 text-micro",
        md: "h-8 w-8 text-xs",
      },
      // The halo a stacked avatar needs to separate from its neighbours; off by default for a lone avatar.
      ring: {
        true: "border-2 border-background",
        false: "",
      },
    },
    defaultVariants: {
      size: "md",
      ring: false,
    },
  }
)
