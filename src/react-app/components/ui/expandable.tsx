import * as React from "react"
import { ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// A mask, not a colour gradient: it fades to whatever surface sits behind, in either theme.
const FADE_MASK = "linear-gradient(to bottom, black calc(100% - 3rem), transparent)"

interface ExpandableProps {
  /** Height the content is clipped to while collapsed, in px. */
  collapsedHeight: number
  /** Opens for good once focus enters, so a caret or selection is never clipped out of view. */
  expandOnFocus?: boolean
  className?: string
  /** Classes for the clipped box; widen it (negative margin + padding) to keep overhanging content inside the fade mask. */
  contentClassName?: string
  children: React.ReactNode
}

/** Long content clipped to a height and faded, with a centred "Expand" pill; short content renders whole. */
function Expandable({ collapsedHeight, expandOnFocus, className, contentClassName, children }: ExpandableProps) {
  const [expanded, setExpanded] = React.useState(false)
  const [overflowing, setOverflowing] = React.useState(false)
  const contentRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const measure = () => setOverflowing(el.scrollHeight > collapsedHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    // The inner node grows with the content; the clipped wrapper itself would not.
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    return () => observer.disconnect()
  }, [collapsedHeight])

  const clipped = overflowing && !expanded

  return (
    <div
      data-slot="expandable"
      className={className}
      onFocusCapture={expandOnFocus ? () => setExpanded(true) : undefined}
    >
      <div
        ref={contentRef}
        className={cn(contentClassName, clipped && "overflow-y-clip")}
        style={clipped ? { maxHeight: collapsedHeight, maskImage: FADE_MASK } : undefined}
      >
        <div>{children}</div>
      </div>
      {overflowing && (
        <div className="mt-1 flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="xs"
            aria-expanded={expanded}
            className="text-muted-foreground"
            onClick={() => setExpanded((e) => !e)}
          >
            <ChevronDown
              className={cn("transition-transform duration-fast ease-out-quart", expanded && "rotate-180")}
            />
            {expanded ? "Collapse" : "Expand"}
          </Button>
        </div>
      )}
    </div>
  )
}

export { Expandable }
