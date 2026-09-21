/**
 * The in-app path a link points at, or null for anything that isn't this app
 * (or isn't http at all).
 *
 * Resolves against `origin` with the URL parser instead of checking the raw
 * string's prefix — a prefix check like `href.startsWith("/") &&
 * !href.startsWith("//")` passes a string such as `/\evil.example/x` (starts
 * with "/", not "//"), but the very same string, once it becomes a real
 * anchor's `href`, gets its `\` normalized to `/` by the browser and resolves
 * to `https://evil.example/x` — a different origin rendered as if it were an
 * internal `<Link>` (SECURITY.md S-06). Parsing the string exactly the way
 * the browser itself will, and only trusting a same-origin result, closes
 * that gap for any equivalent bypass, not just this one string shape.
 */
export function appPath(href: string, origin: string): string | null {
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
