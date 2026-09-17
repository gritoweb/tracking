// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useEntryDraft } from "./useEntryDraft";

describe("useEntryDraft billable default", () => {
  it("is billable when the caller says nothing, matching the header Add and calendar-slot dialogs", () => {
    const { result } = renderHook(() => useEntryDraft({}));
    expect(result.current.draft.billable).toBe(true);
  });

  it("keeps an explicit false from the caller", () => {
    const { result } = renderHook(() => useEntryDraft({ billable: false }));
    expect(result.current.draft.billable).toBe(false);
  });

  it("resets back to billable when the next selection doesn't say otherwise", () => {
    const { result } = renderHook(() => useEntryDraft({ billable: false }));
    act(() => result.current.reset({}));
    expect(result.current.draft.billable).toBe(true);
  });
});
