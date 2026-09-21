// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { ReportFigure } from "./ReportFigure"

describe("ReportFigure", () => {
  it("keeps a share column narrow and fixed, so the rows line up", () => {
    render(<ReportFigure kind="percent">26%</ReportFigure>)
    expect(screen.getByText("26%")).toHaveClass("w-9", "shrink-0", "text-right", "text-xs", "tabular-nums", "text-muted-foreground")
  })

  it("gives an amount column its own, wider width", () => {
    render(<ReportFigure kind="amount">$120.00</ReportFigure>)
    const el = screen.getByText("$120.00")
    expect(el).toHaveClass("w-20", "text-right", "tabular-nums")
    expect(el).not.toHaveClass("w-9")
  })
})
