// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useSyncedField } from "./useSyncedField";

const setup = (server: string, key: string | null = "t1") =>
  renderHook(({ server, key }) => useSyncedField(server, key), { initialProps: { server, key } });

describe("useSyncedField", () => {
  it("starts with the server's value", () => {
    expect(setup("Write docs").result.current[0]).toBe("Write docs");
  });

  it("follows the server when someone else changes it and the person has not typed", () => {
    const { result, rerender } = setup("Write docs");
    rerender({ server: "Write the docs", key: "t1" });
    expect(result.current[0]).toBe("Write the docs");
  });

  it("keeps what the person is typing when the server changes underneath", () => {
    const { result, rerender } = setup("Write docs");
    act(() => result.current[1]("Write docs, then test"));
    rerender({ server: "Someone else's name", key: "t1" });
    expect(result.current[0]).toBe("Write docs, then test");
  });

  it("takes the server's value again once it matches what the person saved", () => {
    const { result, rerender } = setup("Write docs");
    act(() => result.current[1]("Mine"));
    rerender({ server: "Mine", key: "t1" });
    expect(result.current[0]).toBe("Mine");
    rerender({ server: "Theirs", key: "t1" });
    expect(result.current[0]).toBe("Theirs");
  });

  it("starts over on another task, even while the person had typed something", () => {
    const { result, rerender } = setup("First");
    act(() => result.current[1]("typed"));
    rerender({ server: "Second", key: "t2" });
    expect(result.current[0]).toBe("Second");
  });

  it("does nothing when nothing changed", () => {
    const { result, rerender } = setup("Same");
    rerender({ server: "Same", key: "t1" });
    expect(result.current[0]).toBe("Same");
  });
});
