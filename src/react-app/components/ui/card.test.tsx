// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { Card } from "@/components/ui/card"

describe("Card", () => {
  it("defaults to no border/shadow, tone-only separation (DESIGN.md §4)", () => {
    render(<Card data-testid="card">content</Card>)
    const el = screen.getByTestId("card")
    expect(el).toHaveClass("bg-card", "rounded-container")
    expect(el.className).not.toMatch(/\bborder\b/)
    expect(el.className).not.toMatch(/\bshadow-/)
  })

  it("default size keeps the section spacing; compact is the tight one for a card per list item", () => {
    render(<Card data-testid="section">content</Card>)
    expect(screen.getByTestId("section")).toHaveClass("gap-6", "py-6")
    render(
      <Card data-testid="item" size="compact">
        content
      </Card>
    )
    const el = screen.getByTestId("item")
    expect(el).toHaveClass("px-4", "py-3")
    expect(el).not.toHaveClass("py-6")
    expect(el.className).not.toMatch(/\bborder\b/)
  })

  it("tone=muted is the step for a card sitting on an overlay surface", () => {
    render(
      <Card data-testid="card" tone="muted">
        content
      </Card>
    )
    const el = screen.getByTestId("card")
    expect(el).toHaveClass("bg-muted")
    expect(el.className).not.toMatch(/\bborder\b/)
  })

  it("tone=destructive adds a wash, never a border", () => {
    render(
      <Card data-testid="card" tone="destructive">
        content
      </Card>
    )
    const el = screen.getByTestId("card")
    expect(el).toHaveClass("bg-destructive/5")
    expect(el.className).not.toMatch(/\bborder\b/)
  })

  it("interactive=true adds cursor-pointer and hover styling", () => {
    render(
      <Card data-testid="card" interactive>
        content
      </Card>
    )
    const el = screen.getByTestId("card")
    expect(el).toHaveClass("cursor-pointer")
  })
})
