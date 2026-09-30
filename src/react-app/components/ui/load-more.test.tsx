// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { LoadMore } from "./load-more"

let seen: ((entries: { isIntersecting: boolean }[]) => void) | null = null
beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb: (entries: { isIntersecting: boolean }[]) => void) {
        seen = cb
      }
      observe() {}
      disconnect() {}
    }
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  seen = null
})

describe("LoadMore", () => {
  it("loads more when it scrolls into view, and on click", () => {
    const onLoadMore = vi.fn()
    render(<LoadMore onLoadMore={onLoadMore} loading={false} remaining="70 left" />)
    seen?.([{ isIntersecting: true }])
    expect(onLoadMore).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("button", { name: "Load more · 70 left" }))
    expect(onLoadMore).toHaveBeenCalledTimes(2)
  })

  it("does not watch the viewport while a step is loading", () => {
    render(<LoadMore onLoadMore={() => {}} loading remaining="70 left" />)
    expect(seen).toBeNull()
    expect(screen.getByRole("button")).toBeDisabled()
  })
})
