// @vitest-environment jsdom
import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"

import { Avatar, AvatarStack } from "@/components/ui/avatar"
import { AssignButton } from "@/components/ui/assign-button"

describe("Avatar", () => {
  it("renders initials when no image is given", () => {
    const { container } = render(<Avatar name="Ada Lovelace" />)
    expect(container.textContent).toBe("AL")
  })

  it("falls back to initials once the image fails to load", () => {
    const { container } = render(<Avatar name="Ada Lovelace" image="https://example.com/broken.png" />)
    const img = container.querySelector("img")
    expect(img).not.toBeNull()
    fireEvent.error(img as HTMLImageElement)
    expect(container.textContent).toBe("AL")
  })

  it("falls back to '?' with no name or email", () => {
    const { container } = render(<Avatar />)
    expect(container.textContent).toBe("?")
  })
})

describe("AvatarStack", () => {
  const members = [
    { id: "1", name: "Ada Lovelace" },
    { id: "2", name: "Grace Hopper" },
    { id: "3", name: "Margaret Hamilton" },
    { id: "4", name: "Katherine Johnson" },
  ]

  it("renders only up to max avatars", () => {
    const { container } = render(<AvatarStack members={members} max={3} />)
    expect(container.querySelectorAll('[data-slot="avatar"]')).toHaveLength(3)
  })

  it("shows a +N overflow tail past max", () => {
    render(<AvatarStack members={members} max={3} />)
    expect(screen.getByText("+1")).toBeTruthy()
  })

  it("renders no overflow tail when everyone fits", () => {
    const { container } = render(<AvatarStack members={members.slice(0, 2)} max={3} />)
    expect(container.querySelector('[data-slot="avatar-overflow"]')).toBeNull()
  })
})

describe("AssignButton", () => {
  it("defaults to an accessible 'Add assignee' name", () => {
    render(<AssignButton />)
    expect(screen.getByRole("button", { name: "Add assignee" })).toBeTruthy()
  })

  it("renders a dashed border, per the Dashed Rule", () => {
    render(<AssignButton />)
    expect(screen.getByRole("button", { name: "Add assignee" }).className).toContain("border-dashed")
  })
})
