// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HtmlStage } from "./HtmlStage";

afterEach(() => vi.unstubAllGlobals());

describe("HtmlStage", () => {
  it("renders the file in an empty-sandbox iframe behind a CSP with no script or network source", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<h1>Report</h1><script>alert(1)</script>")));
    render(<HtmlStage url="/api/attachments/a1" zoom={1.5} />);
    const frame = await screen.findByTitle("HTML preview");
    expect(frame).toHaveAttribute("sandbox", "");
    const doc = frame.getAttribute("srcdoc") ?? "";
    expect(doc.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true);
    expect(doc).toContain("default-src 'none'");
    expect(doc).not.toContain("script-src");
    expect(doc).not.toContain("connect-src");
    expect(doc).toContain("<h1>Report</h1>");
    expect(frame.style.transform).toBe("scale(1.5)");
  });
});
