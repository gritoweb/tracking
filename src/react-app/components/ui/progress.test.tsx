// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render } from "@testing-library/react"

import { Progress } from "@/components/ui/progress"

describe("Progress", () => {
  it("defaults to a neutral track with an ink fill", () => {
    const { getByTestId } = render(<Progress value={40} data-testid="track" />)
    const track = getByTestId("track")
    expect(track).toHaveClass("bg-border")
    expect(track.querySelector('[data-slot="progress-indicator"]')).toHaveClass("bg-foreground")
  })

  it("tone=destructive pairs the /20 track with the destructive fill", () => {
    const { getByTestId } = render(<Progress value={100} tone="destructive" data-testid="track" />)
    const track = getByTestId("track")
    expect(track).toHaveClass("bg-destructive/20")
    expect(track.querySelector('[data-slot="progress-indicator"]')).toHaveClass("bg-destructive")
  })
})
