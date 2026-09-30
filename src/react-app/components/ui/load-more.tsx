import { useEffect, useRef } from "react"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { cn } from "@/lib/utils"

interface LoadMoreProps {
  /** Loads the next step; called when the button scrolls into view and when it is clicked. */
  onLoadMore: () => void
  loading: boolean
  /** What is left to load, e.g. "70 left". */
  remaining: string
  className?: string
}

/** The end of a long list: loads more on its own when scrolled into view (like a comment thread), and is a button for keyboards. */
function LoadMore({ onLoadMore, loading, remaining, className }: LoadMoreProps) {
  const ref = useRef<HTMLButtonElement>(null)
  const latest = useRef(onLoadMore)
  useEffect(() => {
    latest.current = onLoadMore
  })

  useEffect(() => {
    const node = ref.current
    if (!node || loading) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) latest.current()
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [loading])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="sm"
      data-slot="load-more"
      disabled={loading}
      onClick={() => onLoadMore()}
      className={cn("w-full gap-1.5 text-muted-foreground", className)}
    >
      {loading && <Spinner size="sm" label="Loading more" />}
      {loading ? "Loading…" : `Load more · ${remaining}`}
    </Button>
  )
}

export { LoadMore }
