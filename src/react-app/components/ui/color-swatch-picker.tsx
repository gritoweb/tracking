import * as React from "react"
import { Check } from "lucide-react"
import type { VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { getContrastColor } from "@/lib/colorUtils"
import { SWATCH_COLORS, SWATCH_COLOR_NAMES } from "@shared/colors"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { colorSwatchButtonVariants } from "@/components/ui/color-swatch-picker-variants"

interface ColorSwatchPickerProps extends VariantProps<typeof colorSwatchButtonVariants> {
  value: string
  onChange: (color: string) => void
  colors?: readonly string[]
  columns?: number
  className?: string
  "aria-label"?: string
}

/** One swatch grid for the whole app: outline selection, contrast-aware check, arrow-key radiogroup. */
function ColorSwatchPicker({
  value,
  onChange,
  colors = SWATCH_COLORS,
  columns = 9,
  size = "md",
  className,
  "aria-label": ariaLabel = "Choose a color",
}: ColorSwatchPickerProps) {
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([])
  const rawIndex = colors.indexOf(value)
  const activeIndex = rawIndex === -1 ? 0 : rawIndex

  const moveTo = (nextIndex: number) => {
    const wrapped = (nextIndex + colors.length) % colors.length
    onChange(colors[wrapped])
    itemRefs.current[wrapped]?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault()
        moveTo(activeIndex + 1)
        break
      case "ArrowLeft":
        event.preventDefault()
        moveTo(activeIndex - 1)
        break
      case "ArrowDown":
        event.preventDefault()
        moveTo(activeIndex + columns)
        break
      case "ArrowUp":
        event.preventDefault()
        moveTo(activeIndex - columns)
        break
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={cn("grid gap-1.5", className)}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {colors.map((color, index) => {
        const selected = color === value
        const name = SWATCH_COLOR_NAMES[color] ?? color
        return (
          <Tooltip key={color}>
            <TooltipTrigger asChild>
              <button
                ref={(el) => {
                  itemRefs.current[index] = el
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={name}
                tabIndex={index === activeIndex ? 0 : -1}
                onClick={() => onChange(color)}
                style={{ backgroundColor: color }}
                className={colorSwatchButtonVariants({ size, selected })}
              >
                {selected && (
                  <Check
                    className={size === "sm" ? "h-2.5 w-2.5" : "h-3 w-3"}
                    style={{ color: getContrastColor(color) }}
                  />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>{name}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

export { ColorSwatchPicker }
