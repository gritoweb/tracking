// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { Button } from "@/components/ui/button"

describe("Button variant ghost-destructive", () => {
  it("rests muted and turns destructive only under the pointer", () => {
    render(<Button variant="ghost-destructive" aria-label="Remove">x</Button>)
    const el = screen.getByRole("button", { name: "Remove" })
    expect(el).toHaveClass("text-muted-foreground", "hover:text-destructive", "hover:bg-accent")
    // The ghost's own hover ink must not survive next to the destructive one.
    expect(el.className).not.toMatch(/(^|\s)hover:text-accent-foreground/)
  })

  it("keeps the ghost geometry: the same size and radius tokens as any other button", () => {
    render(<Button variant="ghost-destructive" size="icon-sm" aria-label="Remove">x</Button>)
    expect(screen.getByRole("button", { name: "Remove" })).toHaveClass("size-8", "rounded-full")
  })

  it("lets a screen add layout classes without losing the variant", () => {
    render(<Button variant="ghost-destructive" className="tt-reveal" aria-label="Remove">x</Button>)
    expect(screen.getByRole("button", { name: "Remove" })).toHaveClass("tt-reveal", "hover:text-destructive")
  })

  it("includes cursor-pointer in base button classes", () => {
    render(<Button>Click me</Button>)
    expect(screen.getByRole("button", { name: "Click me" })).toHaveClass("cursor-pointer")
  })
})
