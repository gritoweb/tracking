// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { Duration, Numeric } from "@/components/ui/numeric"

describe("Numeric", () => {
  it("renders tabular-nums Geist Mono on any child content", () => {
    render(<Numeric>42%</Numeric>)
    const el = screen.getByText("42%")
    expect(el.className).toContain("tabular-nums")
    expect(el.className).toContain("font-mono")
  })
})

describe("Duration", () => {
  it("formats through formatDurationShort by default", () => {
    render(<Duration seconds={5430} />)
    expect(screen.getByText("1h 30m")).toBeTruthy()
  })

  it("formats through formatSeconds when format is clock", () => {
    render(<Duration seconds={5400} format="clock" />)
    expect(screen.getByText("01:30:00")).toBeTruthy()
  })

  it("floors sub-minute durations to whole seconds, matching the shared helper", () => {
    render(<Duration seconds={45} />)
    expect(screen.getByText("45s")).toBeTruthy()
  })
})
