// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { SelectionBar } from "./selection-bar"

describe("SelectionBar", () => {
  it("names the toolbar after the selection and clears it from the chip", () => {
    const onClear = vi.fn()
    render(
      <SelectionBar label="3 tasks selected" onClear={onClear}>
        <button type="button">Archive</button>
      </SelectionBar>
    )
    expect(screen.getByRole("toolbar", { name: "3 tasks selected" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: /3 tasks selected.*clear selection/ }))
    expect(onClear).toHaveBeenCalledOnce()
    expect(screen.getByRole("button", { name: "Archive" })).toBeInTheDocument()
  })
})
