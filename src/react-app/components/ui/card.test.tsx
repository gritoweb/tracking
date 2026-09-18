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
})
