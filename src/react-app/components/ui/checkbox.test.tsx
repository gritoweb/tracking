// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { Checkbox } from "@/components/ui/checkbox"

describe("Checkbox", () => {
  it("starts unchecked with aria-checked false", () => {
    render(<Checkbox aria-label="Select entry" checked={false} onCheckedChange={() => {}} />)
    const box = screen.getByRole("checkbox", { name: "Select entry" })
    expect(box.getAttribute("aria-checked")).toBe("false")
  })

  it("calls onCheckedChange with true on click", () => {
    const onCheckedChange = vi.fn()
    render(<Checkbox aria-label="Select entry" checked={false} onCheckedChange={onCheckedChange} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Select entry" }))
    expect(onCheckedChange).toHaveBeenCalledWith(true)
  })

  it("is a native focusable button, so Space/Enter activation is native browser behaviour", () => {
    render(<Checkbox aria-label="Select entry" checked={false} onCheckedChange={() => {}} />)
    const box = screen.getByRole("checkbox", { name: "Select entry" })
    expect(box.tagName).toBe("BUTTON")
    expect(box.getAttribute("type")).toBe("button")
    expect(box.getAttribute("tabindex")).not.toBe("-1")
  })

  it("renders aria-checked=mixed and a minus glyph when indeterminate", () => {
    render(<Checkbox aria-label="Select all" checked="indeterminate" onCheckedChange={() => {}} />)
    const box = screen.getByRole("checkbox", { name: "Select all" })
    expect(box.getAttribute("aria-checked")).toBe("mixed")
    expect(box.getAttribute("data-state")).toBe("indeterminate")
  })

  it("reflects checked=true with data-state=checked", () => {
    render(<Checkbox aria-label="Select entry" checked onCheckedChange={() => {}} />)
    const box = screen.getByRole("checkbox", { name: "Select entry" })
    expect(box.getAttribute("aria-checked")).toBe("true")
    expect(box.getAttribute("data-state")).toBe("checked")
  })

  it("applies the destructive tone as a data attribute for priority tinting", () => {
    render(<Checkbox aria-label="Done" tone="destructive" checked={false} onCheckedChange={() => {}} />)
    const box = screen.getByRole("checkbox", { name: "Done" })
    expect(box.getAttribute("data-tone")).toBe("destructive")
  })
})
