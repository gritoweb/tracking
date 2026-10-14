// The client PDFs (react-pdf) compile an inlined WebAssembly layout engine; without these the production CSP blocks them.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("the document CSP in public/_headers", () => {
  const csp = readFileSync("public/_headers", "utf8").match(/Content-Security-Policy: (.*)/)![1];
  const directive = (name: string) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `)) ?? "";

  it("lets the PDF renderer compile its wasm, without allowing eval", () => {
    expect(directive("script-src")).toContain("'wasm-unsafe-eval'");
    expect(directive("script-src")).not.toContain("'unsafe-eval'");
  });

  it("lets it load that wasm from its inlined data: URL", () => {
    expect(directive("connect-src").split(" ")).toContain("data:");
  });

  it("lets its compressor (fflate) start a worker from a blob: URL, without opening script-src to blob:", () => {
    expect(directive("worker-src").split(" ")).toEqual(expect.arrayContaining(["'self'", "blob:"]));
    expect(directive("script-src")).not.toContain("blob:");
  });

  it("lets FullCalendar load its inlined icon font", () => {
    expect(directive("font-src").split(" ")).toContain("data:");
  });
});
