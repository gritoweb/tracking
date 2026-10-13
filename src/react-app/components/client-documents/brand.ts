import type { ReportSettings } from "@shared/schemas";

/** `hex` blended toward `toward` by `amount` (0–1); the PDFs' muted ink and hairlines derive from the three brand colours. */
export function mix(hex: string, toward: string, amount: number): string {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(toward.slice(1), 16);
  const channel = (shift: number) => {
    const x = (a >> shift) & 255;
    const y = (b >> shift) & 255;
    return Math.round(x + (y - x) * amount);
  };
  return `#${[16, 8, 0].map((s) => channel(s).toString(16).padStart(2, "0")).join("")}`;
}

/** The palette both PDFs draw with. */
export function brandPalette(colors: ReportSettings["colors"]) {
  return {
    primary: colors.primary,
    accent: colors.accent,
    // The accent is a fill colour; as small text on white it needs to be darker to stay legible.
    accentInk: mix(colors.accent, "#000000", 0.3),
    text: colors.text,
    muted: mix(colors.text, "#ffffff", 0.4),
    hairline: mix(colors.text, "#ffffff", 0.88),
    panel: mix(colors.text, "#ffffff", 0.96),
  };
}

export type BrandPalette = ReturnType<typeof brandPalette>;
