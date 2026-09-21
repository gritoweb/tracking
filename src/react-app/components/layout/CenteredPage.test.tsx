// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"

import { CenteredPage } from "./CenteredPage"

describe("CenteredPage", () => {
  it("is the page's one main landmark, full height and centred on the tinted ground", () => {
    render(<CenteredPage><p>hello</p></CenteredPage>)
    const main = screen.getByRole("main")
    expect(main).toHaveClass("flex", "min-h-screen", "items-center", "justify-center", "bg-muted/30", "px-4")
    expect(main).toContainElement(screen.getByText("hello"))
  })
})
