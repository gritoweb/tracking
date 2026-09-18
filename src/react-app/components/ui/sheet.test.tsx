// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"

describe("SheetContent", () => {
  it("defaults to the right side", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Title</SheetTitle>
        </SheetContent>
      </Sheet>
    )
    const el = screen.getByRole("dialog")
    expect(el).toHaveClass("right-0")
    expect(el.className).toContain("data-[state=open]:slide-in-from-right")
  })

  it("renders the top side's own edge treatment", () => {
    render(
      <Sheet open>
        <SheetContent side="top">
          <SheetTitle>Title</SheetTitle>
        </SheetContent>
      </Sheet>
    )
    const el = screen.getByRole("dialog")
    expect(el).toHaveClass("top-0", "rounded-b-container")
    expect(el).not.toHaveClass("right-0")
  })

  it("the overlay uses the --scrim token", () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Title</SheetTitle>
        </SheetContent>
      </Sheet>
    )
    expect(document.querySelector('[data-slot="sheet-overlay"]')).toHaveClass("bg-scrim")
  })
})
