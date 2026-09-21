// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { Input } from "@/components/ui/input"

describe("Input", () => {
  it("defaults to the h-9 size", () => {
    render(<Input aria-label="Name" />)
    expect(screen.getByRole("textbox")).toHaveClass("h-9", "rounded-full")
  })

  it("renders the sm size at h-8", () => {
    render(<Input aria-label="Name" size="sm" />)
    const el = screen.getByRole("textbox")
    expect(el).toHaveClass("h-8")
    expect(el).not.toHaveClass("h-9")
  })

  it("merges a caller className over the variant classes", () => {
    render(<Input aria-label="Name" className="pl-8" />)
    expect(screen.getByRole("textbox")).toHaveClass("pl-8", "h-9")
  })
})

describe("Input variant bare", () => {
  it("has no fill, border or shadow of its own, in the dark theme too", () => {
    render(<Input variant="bare" aria-label="Field" />)
    const el = screen.getByLabelText("Field")
    expect(el).toHaveClass("border-0", "bg-transparent", "shadow-none", "dark:bg-transparent")
    // The base's dark fill must be gone, or it wins over bg-transparent and shows a lighter box.
    expect(el.className).not.toMatch(/dark:bg-input\/30/)
  })

  it("leaves the default look alone", () => {
    render(<Input aria-label="Field" />)
    const el = screen.getByLabelText("Field")
    expect(el).toHaveClass("border", "border-input", "dark:bg-input/30", "rounded-full")
    expect(el.className).not.toMatch(/(^|\s)border-0(\s|$)/)
  })

  it("lets a screen keep its own padding and ring on top of the variant", () => {
    render(<Input variant="bare" className="px-0 focus-visible:ring-0" aria-label="Field" />)
    expect(screen.getByLabelText("Field")).toHaveClass("px-0", "focus-visible:ring-0", "border-0")
  })
})
