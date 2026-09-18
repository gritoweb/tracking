import { describe, expect, it } from "vitest";
import { isoOffset } from "./local-date";

describe("isoOffset", () => {
  it("turns getTimezoneOffset minutes into an ISO suffix", () => {
    expect(isoOffset(180)).toBe("-03:00");
    expect(isoOffset(0)).toBe("+00:00");
    expect(isoOffset(-330)).toBe("+05:30");
    expect(isoOffset(-60)).toBe("+01:00");
  });
});
