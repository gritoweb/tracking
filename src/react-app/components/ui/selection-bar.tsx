import type { ReactNode } from "react"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { floatingToolbarVariants } from "@/components/ui/floating-toolbar-variants"
import { cn } from "@/lib/utils"

interface SelectionBarProps {
  /** What is selected, e.g. "3 tasks selected" — also the toolbar's accessible name. */
  label: string
  onClear: () => void
  /** The actions: icon buttons (`size="icon-sm"`, `aria-label` + `title`) and their menus. */
  children: ReactNode
  className?: string
}

/** Floats at the bottom while a list has a selection: what is selected on the left, what to do with it on the right. */
function SelectionBar({ label, onClear, children, className }: SelectionBarProps) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      data-slot="selection-bar"
      className={cn(
        floatingToolbarVariants({ layout: "bar" }),
        "fixed bottom-6 left-1/2 max-w-[calc(100vw-2rem)] -translate-x-1/2 overflow-x-auto",
        "animate-in fade-in-0 slide-in-from-bottom-2 duration-base ease-out-quart",
        className
      )}
    >
      <Button variant="secondary" size="sm" onClick={onClear} title="Clear selection (Esc)" className="shrink-0 gap-1.5">
        {label}
        <X className="h-3.5 w-3.5" aria-hidden />
        <span className="sr-only">— clear selection</span>
      </Button>
      <Separator orientation="vertical" className="mx-1 h-5" />
      {children}
    </div>
  )
}

export { SelectionBar }
