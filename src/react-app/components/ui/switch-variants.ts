import { cva } from "class-variance-authority"

export const switchVariants = cva(
  "peer relative inline-flex shrink-0 items-center cursor-pointer rounded-full border border-transparent before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] transition-all duration-fast ease-out-quart outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary data-[state=unchecked]:bg-input dark:data-[state=unchecked]:bg-input/80",
  {
    variants: {
      size: {
        default: "h-[1.15rem] w-8",
        sm: "h-3.5 w-6",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

export const switchThumbVariants = cva(
  "pointer-events-none block rounded-full bg-background ring-0 transition-transform duration-fast ease-out-quart data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 dark:data-[state=checked]:bg-primary-foreground dark:data-[state=unchecked]:bg-foreground",
  {
    variants: {
      size: {
        default: "size-4",
        sm: "size-3",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)
