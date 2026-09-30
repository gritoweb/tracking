// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { Pagination } from "./pagination"
import { pageItems } from "@/lib/pagination"

describe("pageItems", () => {
  it("lists every page when there are few", () => {
    expect(pageItems(1, 3)).toEqual([1, 2, 3])
  })

  it("keeps first, last and the current page's neighbours, with gaps", () => {
    expect(pageItems(3, 11)).toEqual([1, 2, 3, 4, "gap", 11])
    expect(pageItems(6, 11)).toEqual([1, "gap", 5, 6, 7, "gap", 11])
    expect(pageItems(11, 11)).toEqual([1, "gap", 10, 11])
  })

  it("shows a single missing page instead of a gap", () => {
    expect(pageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
})

describe("Pagination", () => {
  it("renders nothing for a single page", () => {
    const { container } = render(<Pagination page={1} pageCount={1} onPageChange={() => {}} label="Pages" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("marks the current page and jumps to the one clicked", () => {
    const onPageChange = vi.fn()
    render(<Pagination page={3} pageCount={11} onPageChange={onPageChange} label="Backlog archive pages" />)
    expect(screen.getByRole("navigation", { name: "Backlog archive pages" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Page 3" })).toHaveAttribute("aria-current", "page")
    fireEvent.click(screen.getByRole("button", { name: "Page 11" }))
    expect(onPageChange).toHaveBeenCalledWith(11)
    fireEvent.click(screen.getByRole("button", { name: "Previous page" }))
    expect(onPageChange).toHaveBeenLastCalledWith(2)
  })
})
