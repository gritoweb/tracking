// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { Star } from "lucide-react"

import { RemoveButton } from "@/components/ui/remove-button"


describe("RemoveButton", () => {
  it("exposes the passed label as its accessible name", () => {
    render(<RemoveButton aria-label="Remove favorite" />)
    expect(screen.getByRole("button", { name: "Remove favorite" })).toBeTruthy()
  })

  it("fires onClick when pressed", () => {
    const onClick = vi.fn()
    render(<RemoveButton aria-label="Delete saved report" onClick={onClick} />)
    fireEvent.click(screen.getByRole("button", { name: "Delete saved report" }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("accepts an icon override for a call site whose action isn't literally a trash can", () => {
    render(<RemoveButton aria-label="Remove favorite" icon={Star} />)
    expect(screen.getByRole("button", { name: "Remove favorite" }).querySelector("svg")).toBeTruthy()
  })
})
