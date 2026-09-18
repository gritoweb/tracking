// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { Select, SelectTrigger, SelectValue } from "@/components/ui/select"

describe("SelectTrigger", () => {
  it("defaults to h-9", () => {
    render(
      <Select>
        <SelectTrigger aria-label="Project">
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
      </Select>
    )
    expect(screen.getByRole("combobox")).toHaveClass("h-9")
  })

  it("renders the sm size at h-8", () => {
    render(
      <Select>
        <SelectTrigger aria-label="Project" size="sm">
          <SelectValue placeholder="Pick one" />
        </SelectTrigger>
      </Select>
    )
    const el = screen.getByRole("combobox")
    expect(el).toHaveClass("h-8")
    expect(el).toHaveAttribute("data-size", "sm")
  })
})
