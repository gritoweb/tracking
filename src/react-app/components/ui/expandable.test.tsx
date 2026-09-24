// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { Expandable } from "@/components/ui/expandable"

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    disconnect() {}
    unobserve() {}
  } as unknown as typeof ResizeObserver
})

function renderWithHeight(scrollHeight: number, expandOnFocus = false) {
  Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => scrollHeight })
  return render(
    <Expandable collapsedHeight={100} expandOnFocus={expandOnFocus}>
      <input aria-label="inside" />
    </Expandable>
  )
}

describe("Expandable", () => {
  it("shows no control when the content fits", () => {
    renderWithHeight(80)
    expect(screen.queryByRole("button", { name: /expand/i })).toBeNull()
  })

  it("clips long content and toggles between Expand and Collapse", () => {
    renderWithHeight(400)
    const button = screen.getByRole("button", { name: /expand/i })
    expect(button.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(button)
    expect(screen.getByRole("button", { name: /collapse/i }).getAttribute("aria-expanded")).toBe("true")
  })

  it("opens when focus enters, if asked to", () => {
    renderWithHeight(400, true)
    fireEvent.focus(screen.getByLabelText("inside"))
    expect(screen.getByRole("button", { name: /collapse/i })).toBeTruthy()
  })
})
