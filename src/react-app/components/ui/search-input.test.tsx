// @vitest-environment jsdom
import { createRef } from "react"
import { describe, expect, it, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

import { SearchInput } from "@/components/ui/search-input"


describe("SearchInput", () => {
  it("forwards its ref to the underlying input", () => {
    const ref = createRef<HTMLInputElement>()
    render(<SearchInput ref={ref} aria-label="Search projects" onChange={() => {}} />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  it("renders and forwards the current value", () => {
    render(<SearchInput aria-label="Search projects" value="acme" onChange={() => {}} />)
    expect(screen.getByRole("textbox", { name: "Search projects" })).toHaveProperty("value", "acme")
  })

  it("forwards onChange as the user types", () => {
    const onChange = vi.fn()
    render(<SearchInput aria-label="Search projects" value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole("textbox", { name: "Search projects" }), {
      target: { value: "acme" },
    })
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
