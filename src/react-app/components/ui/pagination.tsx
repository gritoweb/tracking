import { ChevronLeft, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { pageItems } from "@/lib/pagination"

interface PaginationProps {
  page: number
  pageCount: number
  onPageChange: (page: number) => void
  /** Names the navigation for assistive tech, e.g. "Backlog archive pages". */
  label: string
  disabled?: boolean
  className?: string
}

/** Numbered pages, compact enough for a board column: ‹ 1 2 [3] 4 … 11 ›. Renders nothing for a single page. */
function Pagination({ page, pageCount, onPageChange, label, disabled = false, className }: PaginationProps) {
  if (pageCount <= 1) return null
  return (
    <nav aria-label={label} data-slot="pagination" className={cn("flex items-center justify-center gap-0.5", className)}>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Previous page"
        title="Previous page"
        disabled={disabled || page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        <ChevronLeft />
      </Button>
      {pageItems(page, pageCount).map((item, i) =>
        item === "gap" ? (
          <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground" aria-hidden>
            …
          </span>
        ) : (
          <Button
            key={item}
            variant={item === page ? "secondary" : "ghost"}
            size="icon-xs"
            aria-label={`Page ${item}`}
            aria-current={item === page ? "page" : undefined}
            disabled={disabled}
            onClick={() => onPageChange(item)}
            className="text-xs tabular-nums"
          >
            {item}
          </Button>
        )
      )}
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Next page"
        title="Next page"
        disabled={disabled || page >= pageCount}
        onClick={() => onPageChange(page + 1)}
      >
        <ChevronRight />
      </Button>
    </nav>
  )
}

export { Pagination }
