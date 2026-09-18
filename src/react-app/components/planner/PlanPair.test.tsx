// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { PlanPair } from "./PlanPair"

describe("PlanPair", () => {
  it("shows an em dash for both lines when nothing is planned or tracked", () => {
    render(<PlanPair cell={{ planned: 0, actual: 0 }} />)
    expect(screen.getAllByText("–")).toHaveLength(1)
  })

  it("de-emphasises an absent plan and gives the tracked figure the weight instead", () => {
    render(<PlanPair cell={{ planned: 0, actual: 3600 }} />)
    const planned = screen.getByText("–")
    const tracked = screen.getByText("1h")
    expect(planned.className).toContain("text-muted-foreground/60")
    expect(tracked.className).toContain("font-medium")
  })

  it("warns when actual exceeds planned", () => {
    render(<PlanPair cell={{ planned: 1800, actual: 3600 }} />)
    expect(screen.getByText("1h")).toHaveClass("text-warning-ink")
  })

  it("does not warn when on or under plan", () => {
    render(<PlanPair cell={{ planned: 3600, actual: 1800 }} />)
    expect(screen.getByText("30m")).not.toHaveClass("text-warning-ink")
  })
})
