// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

import { ClearButton } from "@/components/ui/clear-button"


describe("ClearButton", () => {
  it("exposes the passed label as its accessible name", () => {
    render(<ClearButton aria-label="Remove tag design" />)
    expect(screen.getByRole("button", { name: "Remove tag design" })).toBeTruthy()
  })

  it("fires onClick when pressed", () => {
    const onClick = vi.fn()
    render(<ClearButton aria-label="Remove tag design" onClick={onClick} />)
    fireEvent.click(screen.getByRole("button", { name: "Remove tag design" }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
