import { cva } from "class-variance-authority"

// `md` (default) stays unbounded, matching today's look; sm/lg/full cap height via the `--size-cap-*` tokens (css/global/variables.css).
export const dialogContentVariants = cva(
  "fixed top-[50%] left-[50%] z-portal grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-container border bg-popover p-6 shadow-lg duration-base ease-out-quart outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
  {
    variants: {
      size: {
        sm: "sm:max-w-sm max-h-(--size-cap-60vh) overflow-y-auto",
        md: "sm:max-w-lg",
        lg: "sm:max-w-2xl max-h-(--size-cap-85vh) overflow-y-auto",
        full: "sm:max-w-4xl max-h-(--size-cap-85vh) overflow-y-auto",
      },
    },
    defaultVariants: {
      size: "md",
    },
  }
)
