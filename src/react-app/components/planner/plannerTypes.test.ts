import { describe, expect, it } from "vitest"
import { rowKeyOf } from "./plannerTypes"

describe("rowKeyOf", () => {
  it("joins project and task ids with a double underscore", () => {
    expect(rowKeyOf("p1", "t1")).toBe("p1__t1")
  })

  it("falls back to an empty string for a null task", () => {
    expect(rowKeyOf("p1", null)).toBe("p1__")
  })

  it("falls back to an empty string for a null project", () => {
    expect(rowKeyOf(null, "t1")).toBe("__t1")
  })

  it("is stable so it can key a Map across renders", () => {
    expect(rowKeyOf("p1", "t1")).toBe(rowKeyOf("p1", "t1"))
  })
})
