import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"
import { tileButtonVariants } from "./tile-button-variants"

/** A selectable option tile; `selected` is exposed to assistive tech as `aria-pressed`. */
export function TileButton({
  selected = false,
  className,
  ...props
}: ComponentProps<"button"> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(tileButtonVariants({ selected }), className)}
      {...props}
    />
  )
}
