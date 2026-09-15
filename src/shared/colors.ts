/**
 * The one swatch palette and the one rule for colouring a new project or tag.
 * Worker and client both import this; a second copy is how they drift apart.
 */

/** Hue order — the manual picker grid, where neighbours should look related. */
export const SWATCH_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#10b981", // emerald
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#ec4899", // pink
  "#f43f5e", // rose
  "#64748b", // slate
  "#78716c", // stone
] as const;

/** Readable name per swatch, for accessible labels on the grid. */
export const SWATCH_COLOR_NAMES: Record<string, string> = {
  "#ef4444": "Red",
  "#f97316": "Orange",
  "#f59e0b": "Amber",
  "#eab308": "Yellow",
  "#84cc16": "Lime",
  "#22c55e": "Green",
  "#10b981": "Emerald",
  "#14b8a6": "Teal",
  "#06b6d4": "Cyan",
  "#0ea5e9": "Sky",
  "#3b82f6": "Blue",
  "#6366f1": "Indigo",
  "#8b5cf6": "Violet",
  "#a855f7": "Purple",
  "#ec4899": "Pink",
  "#f43f5e": "Rose",
  "#64748b": "Slate",
  "#78716c": "Stone",
};

/** The same set, alternating warm and cool so successive picks read as distinct. */
export const DISTINCT_COLORS = [
  "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#14b8a6",
  "#ec4899", "#84cc16", "#6366f1", "#f97316", "#06b6d4", "#a855f7",
  "#f43f5e", "#0ea5e9", "#10b981", "#eab308", "#64748b", "#78716c",
] as const;

export const PALETTE = new Set<string>(DISTINCT_COLORS);

/** Nth colour of the distinct order, cycling. */
export function spreadColor(index: number): string {
  const size = DISTINCT_COLORS.length;
  return DISTINCT_COLORS[((index % size) + size) % size];
}

/**
 * The colour a new project or tag gets: the first the workspace isn't using, and
 * a random one once every swatch is taken. Both sides run this, so the chip the
 * user sees before saving is the colour the row ends up with.
 */
export function nextUnusedColor(used: Iterable<string>): string {
  const taken = new Set(used);
  return (
    DISTINCT_COLORS.find((c) => !taken.has(c)) ??
    DISTINCT_COLORS[Math.floor(Math.random() * DISTINCT_COLORS.length)]
  );
}

/** Any swatch, at random — the "don't auto-assign distinct colours" preference. */
export function randomColor(): string {
  return DISTINCT_COLORS[Math.floor(Math.random() * DISTINCT_COLORS.length)];
}
