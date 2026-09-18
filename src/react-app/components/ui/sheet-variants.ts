import { cva } from "class-variance-authority"

// `duration-slow` both ways (was 500ms in / 300ms out on `ease-in-out`) so the panel and scrim move together.
export const sheetContentVariants = cva(
  "fixed z-portal flex flex-col gap-4 bg-popover shadow-lg transition duration-slow ease-out-quart data-[state=closed]:animate-out data-[state=open]:animate-in",
  {
    variants: {
      side: {
        right:
          "inset-y-0 right-0 h-full w-3/4 rounded-l-container border-l data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-sm",
        left:
          "inset-y-0 left-0 h-full w-3/4 rounded-r-container border-r data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-sm",
        top:
          "inset-x-0 top-0 h-auto rounded-b-container border-b data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 h-auto rounded-t-container border-t data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
      },
    },
    defaultVariants: {
      side: "right",
    },
  }
)
