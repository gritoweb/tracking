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
