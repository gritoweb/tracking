import { describe, expect, it } from "vitest";
import {
  defaultInvoiceNumber,
  effectiveRate,
  formatClock,
  hoursSummary,
  invoiceLines,
  invoiceTotal,
} from "./clientDocuments";

describe("the invoice", () => {
  it("bills at the client's rate, else the workspace default, else not at all", () => {
    expect(effectiveRate(80, 65)).toBe(80);
    expect(effectiveRate(null, 65)).toBe(65);
    expect(effectiveRate(0, 65)).toBe(0);
    expect(effectiveRate(null, null)).toBeNull();
  });

  it("charges the exact hours and lists only billable services", () => {
    const lines = invoiceLines(
      32 * 3600 + 10 * 60,
      65,
      [
        { name: "N8N server", amount: 65, billable: true },
        { name: "Email server", amount: 35, billable: true },
        { name: "Internal tool", amount: 999, billable: false },
      ],
      "pt-BR"
    );
    expect(lines).toEqual([
      { description: "Serviços Técnicos", hours: 32 + 10 / 60, amount: 2090.83 },
      { description: "N8N server", hours: null, amount: 65 },
      { description: "Email server", hours: null, amount: 35 },
    ]);
    expect(invoiceTotal(lines)).toBe(2190.83);
  });

  it("leaves the hours line out of a period with no time", () => {
    expect(invoiceLines(0, 65, [{ name: "Hosting", amount: 50, billable: true }], "en")).toEqual([
      { description: "Hosting", hours: null, amount: 50 },
    ]);
  });

  it("suggests the period's year-month as the number", () => {
    expect(defaultInvoiceNumber("2026-09-01")).toBe("2026-09");
  });
});

describe("the hours report", () => {
  it("averages over the days that have time", () => {
    const s = hoursSummary([
      { start: "2026-09-01T12:00:00", duration: 3600 },
      { start: "2026-09-01T15:00:00", duration: 1800 },
      { start: "2026-09-02T12:00:00", duration: 3600 },
    ]);
    expect(s).toEqual({ totalSeconds: 9000, entryCount: 3, dailyAverageHours: 1.25 });
  });

  it("writes durations past a day as hours", () => {
    expect(formatClock(32 * 3600 + 10 * 60)).toBe("32:10:00");
  });
});
