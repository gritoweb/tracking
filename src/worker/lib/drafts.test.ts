import { describe, expect, it } from "vitest";
import { scaleDurations } from "./drafts";

describe("scaleDurations", () => {
  it("scales every duration proportionally to hit the target total", () => {
    const result = scaleDurations([600, 1800, 600], 6000); // 3000s -> 6000s, x2
    expect(result).toEqual([1200, 3600, 1200]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(6000);
  });

  it("shrinks proportionally when the target is below the current total", () => {
    const result = scaleDurations([3600, 3600], 3600); // 2h -> 1h, x0.5
    expect(result).toEqual([1800, 1800]);
  });

  it("never scales an entry below the one-minute floor", () => {
    const result = scaleDurations([600, 60], 120); // ratio 0.2 would drop 60 -> 12
    expect(result.every((d) => d >= 60)).toBe(true);
  });

  it("puts rounding drift on the largest entry so the sum matches exactly", () => {
    const result = scaleDurations([100, 200, 300], 999); // 999/600 doesn't divide evenly
    expect(result.reduce((a, b) => a + b, 0)).toBe(999);
    // The largest input (300) absorbs the leftover drift.
    expect(result[2]).toBeGreaterThanOrEqual(result[0]);
    expect(result[2]).toBeGreaterThanOrEqual(result[1]);
  });

  it("preserves order", () => {
    const result = scaleDurations([100, 500, 200], 800);
    expect(result[1]).toBeGreaterThan(result[0]);
    expect(result[1]).toBeGreaterThan(result[2]);
  });

  it("returns the input unchanged when there is nothing to scale", () => {
    expect(scaleDurations([], 3600)).toEqual([]);
  });

  it("returns the input unchanged when the current total is zero", () => {
    expect(scaleDurations([0, 0], 3600)).toEqual([0, 0]);
  });

  it("returns the input unchanged for a non-positive target", () => {
    expect(scaleDurations([600, 1200], 0)).toEqual([600, 1200]);
    expect(scaleDurations([600, 1200], -60)).toEqual([600, 1200]);
  });

  it("floors a single entry at one minute even scaled far down", () => {
    expect(scaleDurations([36000], 1)).toEqual([60]);
  });
});
