// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { ColorSwatchPicker } from "@/components/ui/color-swatch-picker"
import { TooltipProvider } from "@/components/ui/tooltip"

// jsdom lacks ResizeObserver, which Radix Tooltip needs once arrow-key nav focuses a trigger and opens it.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", ResizeObserverStub)

const COLORS = ["#ef4444", "#3b82f6", "#22c55e"] as const

function renderPicker(value: string, onChange: (c: string) => void) {
  return render(
    <TooltipProvider>
      <ColorSwatchPicker value={value} colors={COLORS} onChange={onChange} columns={3} />
    </TooltipProvider>
  )
}

describe("ColorSwatchPicker", () => {
  it("renders one radio per color inside a radiogroup", () => {
    renderPicker(COLORS[0], () => {})
    expect(screen.getByRole("radiogroup")).toBeTruthy()
    expect(screen.getAllByRole("radio")).toHaveLength(3)
  })

  it("marks only the selected swatch as checked", () => {
    renderPicker(COLORS[1], () => {})
    const radios = screen.getAllByRole("radio")
    expect(radios[0].getAttribute("aria-checked")).toBe("false")
    expect(radios[1].getAttribute("aria-checked")).toBe("true")
    expect(radios[2].getAttribute("aria-checked")).toBe("false")
  })

  it("gives only the selected swatch a tabIndex of 0 (roving tabindex)", () => {
    renderPicker(COLORS[2], () => {})
    const radios = screen.getAllByRole("radio")
    expect(radios[0].tabIndex).toBe(-1)
    expect(radios[1].tabIndex).toBe(-1)
    expect(radios[2].tabIndex).toBe(0)
  })

  it("ArrowRight moves selection to the next swatch", () => {
    const onChange = vi.fn()
    renderPicker(COLORS[0], onChange)
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowRight" })
    expect(onChange).toHaveBeenCalledWith(COLORS[1])
  })

  it("ArrowLeft wraps from the first swatch to the last", () => {
    const onChange = vi.fn()
    renderPicker(COLORS[0], onChange)
    fireEvent.keyDown(screen.getByRole("radiogroup"), { key: "ArrowLeft" })
    expect(onChange).toHaveBeenCalledWith(COLORS[2])
  })

  it("clicking a swatch selects it", () => {
    const onChange = vi.fn()
    renderPicker(COLORS[0], onChange)
    fireEvent.click(screen.getAllByRole("radio")[2])
    expect(onChange).toHaveBeenCalledWith(COLORS[2])
  })

  it("uses outline for selection, never ring", () => {
    renderPicker(COLORS[1], () => {})
    const selected = screen.getAllByRole("radio")[1]
    expect(selected.className).toContain("outline-foreground")
    expect(selected.className).not.toMatch(/\bring-\d/)
  })
})
