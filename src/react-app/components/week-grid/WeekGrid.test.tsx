// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { WeekGrid } from "./WeekGrid"

const days = [new Date("2026-01-05T00:00:00"), new Date("2026-01-06T00:00:00")]

describe("WeekGrid", () => {
  it("renders a table with the shared column geometry", () => {
    render(
      <WeekGrid>
        <WeekGrid.Header days={days} />
      </WeekGrid>
    )
    expect(screen.getByRole("table").className).toContain("min-w-[676px]")
  })

  it("renders Task/Project/Total headers by default, plus one column per day", () => {
    render(
      <WeekGrid>
        <WeekGrid.Header days={days} />
      </WeekGrid>
    )
    expect(screen.getByText("Task")).toBeInTheDocument()
    expect(screen.getByText("Project")).toBeInTheDocument()
    expect(screen.getByText("Total")).toBeInTheDocument()
    // Case is applied via the `uppercase` utility class — the text content itself stays "Mon"/"Tue".
    expect(screen.getByText("Mon")).toBeInTheDocument()
    expect(screen.getByText("Tue")).toBeInTheDocument()
  })

  it("accepts custom labels for Project/Total, e.g. the Planner's plan-vs-actual header", () => {
    render(
      <WeekGrid>
        <WeekGrid.Header days={days} projectLabel="Project (plan)" totalLabel="Sum" />
      </WeekGrid>
    )
    expect(screen.getByText("Project (plan)")).toBeInTheDocument()
    expect(screen.getByText("Sum")).toBeInTheDocument()
  })

  it("LabelCell picks the task vs. project sticky column by variant", () => {
    render(
      <table>
        <tbody>
          <tr>
            <WeekGrid.LabelCell variant="task" data-testid="task-cell" />
            <WeekGrid.LabelCell variant="project" data-testid="project-cell" />
          </tr>
        </tbody>
      </table>
    )
    expect(screen.getByTestId("task-cell").className).toContain("left-0")
    expect(screen.getByTestId("project-cell").className).toContain("left-[92px]")
  })

  it("DayCell centers its content", () => {
    render(
      <table>
        <tbody>
          <tr>
            <WeekGrid.DayCell data-testid="day-cell">–</WeekGrid.DayCell>
          </tr>
        </tbody>
      </table>
    )
    expect(screen.getByTestId("day-cell").className).toContain("text-center")
  })

  it("Row carries the hover/group class the grids rely on for the alternating row tint", () => {
    render(
      <table>
        <tbody>
          <WeekGrid.Row data-testid="row" />
        </tbody>
      </table>
    )
    expect(screen.getByTestId("row").className).toContain("group/row")
  })
})
