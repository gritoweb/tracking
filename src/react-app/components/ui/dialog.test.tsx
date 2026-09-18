// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

describe("DialogContent", () => {
  it("defaults to size=md, unbounded height (today's unchanged look)", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
        </DialogContent>
      </Dialog>
    )
    const el = screen.getByRole("dialog")
    expect(el).toHaveClass("sm:max-w-lg")
    expect(el.className).not.toMatch(/max-h-/)
  })

  it("size=lg caps the height at the --size-cap-85vh token", () => {
    render(
      <Dialog open>
        <DialogContent size="lg">
          <DialogTitle>Title</DialogTitle>
        </DialogContent>
      </Dialog>
    )
    const el = screen.getByRole("dialog")
    expect(el).toHaveClass("sm:max-w-2xl", "overflow-y-auto")
    expect(el.className).toContain("max-h-(--size-cap-85vh)")
  })

  it("the overlay uses the --scrim token, not a raw black", () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Title</DialogTitle>
        </DialogContent>
      </Dialog>
    )
    expect(document.querySelector('[data-slot="dialog-overlay"]')).toHaveClass("bg-scrim")
  })
})
