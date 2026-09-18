// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { Switch } from "@/components/ui/switch"

describe("Switch", () => {
  it("defaults to the default size", () => {
    render(<Switch aria-label="Enabled" />)
    const el = screen.getByRole("switch")
    expect(el).toHaveClass("h-[1.15rem]", "w-8")
    expect(el).toHaveAttribute("data-size", "default")
  })

  it("renders the sm size on both the track and the thumb", () => {
    render(<Switch aria-label="Enabled" size="sm" />)
    const el = screen.getByRole("switch")
    expect(el).toHaveClass("h-3.5", "w-6")
    expect(el.querySelector('[data-slot="switch-thumb"]')).toHaveClass("size-3")
  })
})
