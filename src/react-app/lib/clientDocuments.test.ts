import { describe, expect, it } from "vitest";
import { documentPresetFrom, formatClock } from "./clientDocuments";

describe("the hours report's durations", () => {
  it("writes durations past a day as hours", () => {
    expect(formatClock(32 * 3600 + 10 * 60)).toBe("32:10:00");
  });
});

describe("a document link", () => {
  const preset = (q: string) => documentPresetFrom(new URLSearchParams(q));

  it("pre-fills the generator", () => {
    expect(preset("document=invoice&from=2026-09-01&to=2026-09-30&lang=en&number=2026-09")).toEqual({
      kind: "invoice", locale: "en", from: "2026-09-01", to: "2026-09-30", number: "2026-09", rate: undefined,
    });
    expect(preset("document=invoice&from=2026-09-01&to=2026-09-30&rate=120.5")).toMatchObject({ rate: 120.5 });
    expect(preset("document=hours&from=2026-09-01&to=2026-09-30")).toMatchObject({ kind: "hours", locale: "pt-BR" });
  });

  it("ignores a link without a document or with a broken one", () => {
    expect(preset("")).toBeNull();
    expect(preset("document=receipt&from=2026-09-01&to=2026-09-30")).toBeNull();
    expect(preset("document=invoice&from=2026-09-30&to=2026-09-01")).toBeNull();
    expect(preset("document=invoice&from=yesterday&to=2026-09-01")).toBeNull();
    expect(preset("document=invoice&from=2026-09-01&to=2026-09-30&lang=fr")).toBeNull();
    expect(preset("document=invoice&from=2026-09-01&to=2026-09-30&rate=abc")).toBeNull();
    expect(preset("document=invoice&from=2026-09-01&to=2026-09-30&rate=-5")).toBeNull();
  });
});
