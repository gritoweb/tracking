import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BRAND_RED, BRAND_RED_DARK, GROUND_DARK, GROUND_LIGHT, MUTED_INK_DARK } from "@shared/brand-mark";
import { colors as emailColors } from "../../worker/emails/theme";

// Vitest hands back an empty string for a .css imported with ?raw, so the stylesheet is read from disk.
const CSS = readFileSync(new URL("./global/variables.css", import.meta.url), "utf8");
const DESIGN = readFileSync(new URL("../../../DESIGN.md", import.meta.url), "utf8");

const light = CSS.slice(CSS.indexOf(":root"), CSS.indexOf(".dark"));
const dark = CSS.slice(CSS.indexOf(".dark"));
const tokenIn = (block: string, name: string) => new RegExp(`${name}:\\s*(#[0-9a-fA-F]{6,8});`).exec(block)?.[1];
const NOT_COLOURS = /^--(size-|font-|radius|swatch-)/;

describe("colour tokens (css/global/variables.css)", () => {
  it("are all hexadecimal", () => {
    const declared = [...`${light}${dark}`.matchAll(/(--[\w-]+):\s*([^;]+);/g)].filter((m) => !NOT_COLOURS.test(m[1]));
    expect(declared.length).toBeGreaterThan(40);
    for (const [, name, value] of declared) expect(value.trim(), name).toMatch(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i);
    expect(CSS).not.toContain("oklch(");
  });

  it("are the ones the brand mark carries as hex", () => {
    expect(tokenIn(light, "--primary")).toBe(BRAND_RED);
    expect(tokenIn(dark, "--primary")).toBe(BRAND_RED_DARK);
    expect(tokenIn(light, "--background")).toBe(GROUND_LIGHT);
    expect(tokenIn(dark, "--background")).toBe(GROUND_DARK);
    expect(tokenIn(dark, "--muted-foreground")).toBe(MUTED_INK_DARK);
  });

  it("are the ones the e-mail theme repeats (light only)", () => {
    expect(tokenIn(light, "--primary")).toBe(emailColors.primary);
    expect(tokenIn(light, "--primary-ink")).toBe(emailColors.primaryInk);
    expect(tokenIn(light, "--muted")).toBe(emailColors.canvas);
    expect(tokenIn(light, "--popover")).toBe(emailColors.surface);
    expect(tokenIn(light, "--foreground")).toBe(emailColors.ink);
    expect(tokenIn(light, "--muted-foreground")).toBe(emailColors.mutedInk);
    expect(tokenIn(light, "--border")).toBe(emailColors.border);
  });

  it("put readable ink on the success and warning fills, as the dark theme does (4.5:1 needs a dark label on these)", () => {
    expect(tokenIn(light, "--success-foreground")).toBe(tokenIn(light, "--foreground"));
    expect(tokenIn(light, "--warning-foreground")).toBe(tokenIn(light, "--foreground"));
  });

  it("are the ones DESIGN.md lists at its top", () => {
    const front = DESIGN.slice(0, DESIGN.indexOf("\ntypography:"));
    const listed = (key: string) => new RegExp(`^\\s{2}${key}:\\s*"(#[0-9a-fA-F]{6,8})"`, "m").exec(front)?.[1];
    const expected: Record<string, string | undefined> = {
      primary: tokenIn(light, "--primary"), "primary-dark": tokenIn(dark, "--primary"),
      "bg-light": tokenIn(light, "--background"), "bg-dark": tokenIn(dark, "--background"),
      "surface-light": tokenIn(light, "--popover"), "surface-dark": tokenIn(dark, "--card"),
      "ink-light": tokenIn(light, "--foreground"), "ink-dark": tokenIn(dark, "--foreground"),
      "muted-light": tokenIn(light, "--muted"), "muted-dark": tokenIn(dark, "--muted"),
      "border-light": tokenIn(light, "--border"), "border-dark": tokenIn(dark, "--border"),
      destructive: tokenIn(light, "--destructive"), success: tokenIn(light, "--success"), warning: tokenIn(light, "--warning"),
    };
    for (const [key, value] of Object.entries(expected)) expect(listed(key), key).toBe(value);
  });

  it("are the ones the extension popup uses: it imports this file instead of keeping a copy", () => {
    const popupCss = readFileSync(new URL("../../../extension/popup/popup.css", import.meta.url), "utf8");
    const popupHtml = readFileSync(new URL("../../../extension/popup/index.html", import.meta.url), "utf8");
    expect(popupCss).toContain('@import "../../src/react-app/css/global/variables.css";');
    expect(popupCss).not.toMatch(/oklch\(|#[0-9a-fA-F]{6}/);
    expect(popupHtml).not.toContain("<style");
    expect(popupHtml).toContain("./popup.css");
  });
});
