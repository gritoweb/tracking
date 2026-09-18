// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { Textarea } from "@/components/ui/textarea"

describe("Textarea", () => {
  it("keeps rounded-xl rather than the control pill (DESIGN.md §5's deliberate exception)", () => {
    render(<Textarea aria-label="Notes" />)
    const el = screen.getByRole("textbox")
    expect(el).toHaveClass("rounded-xl")
    expect(el).not.toHaveClass("rounded-full")
  })

  it("merges a caller className", () => {
    render(<Textarea aria-label="Notes" className="min-h-24" />)
    expect(screen.getByRole("textbox")).toHaveClass("min-h-24", "rounded-xl")
  })

  it("title variant is bare and sits at the display step on every breakpoint", () => {
    render(<Textarea aria-label="Name" variant="title" />)
    const el = screen.getByRole("textbox")
    expect(el).toHaveClass("text-display", "md:text-display", "border-0", "bg-transparent")
    expect(el).not.toHaveClass("text-base")
    expect(el).not.toHaveClass("md:text-sm")
  })

  it("bare variant drops the box: no border, no fill, no ring", () => {
    render(<Textarea aria-label="Comment" variant="bare" />)
    expect(screen.getByRole("textbox")).toHaveClass("border-0", "bg-transparent", "rounded-none", "focus-visible:ring-0")
  })
})
