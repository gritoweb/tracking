import { describe, expect, it } from "vitest";
import { hoursSummary, invoiceLines, invoiceTotal } from "./client-documents";

describe("the invoice", () => {
  it("bills whole hours, rounded down, and lists only billable services", () => {
    // The reference invoice: 32h10 of work at 65/h billed as 32 h = 2.080.
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
      { description: "Serviços Técnicos", hours: 32, amount: 2080 },
      { description: "N8N server", hours: null, amount: 65 },
      { description: "Email server", hours: null, amount: 35 },
    ]);
    expect(invoiceTotal(lines)).toBe(2180);
    expect(invoiceLines(32 * 3600 + 59 * 60 + 59, 65, [], "en")[0]).toMatchObject({ hours: 32, amount: 2080 });
  });

  it("leaves the hours line out when there isn't a whole hour", () => {
    expect(invoiceLines(59 * 60, 65, [], "en")).toEqual([]);
    expect(invoiceLines(0, 65, [{ name: "Hosting", amount: 50, billable: true }], "en")).toEqual([
      { description: "Hosting", hours: null, amount: 50 },
    ]);
  });
});

describe("the hours report", () => {
  it("averages over the days that have time", () => {
    const s = hoursSummary([
      { start: "2026-09-01T12:00:00", duration: 3600 },
      { start: "2026-09-01T15:00:00", duration: 1800 },
      { start: "2026-09-02T12:00:00", duration: 3600 },
    ], (iso) => iso.slice(0, 10));
    expect(s).toEqual({ totalSeconds: 9000, entryCount: 3, dailyAverageHours: 1.25 });
  });

});
