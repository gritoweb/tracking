import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge has to be told about `text-micro` and `text-display`.
 *
 * It classifies `text-*` by a built-in list of font sizes; `micro` and `display` are ours
 * (`--text-micro` / `--text-display` in index.css), so out of the box it reads
 * them as *colour* utilities. Any `cn("… text-micro … text-<colour>")`
 * therefore silently dropped the size as a conflict and the element rendered at
 * whatever it inherited — 16px in the case that surfaced this, on a control the
 * Two-Tier Rule says should be 10px. Nothing failed; the type was just wrong.
 *
 * Static `className` strings never reach tailwind-merge and were always fine,
 * which is exactly why this hid: the same class worked in most of the app.
 */
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: ["micro", "display"] }] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
