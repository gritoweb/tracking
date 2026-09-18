/** The in-app path a link points at, or null for anything that isn't this app (or isn't http at all). */
export function appPath(href: string, origin: string): string | null {
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    const url = new URL(href);
    if (url.origin !== origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
