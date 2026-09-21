/** The in-app path a link points at, or null for anything that isn't this app (or isn't http at all). Resolved with the URL parser, not a string prefix — see SECURITY.md S-06. */
export function appPath(href: string, origin: string): string | null {
  try {
    const url = new URL(href, origin);
    if (url.origin !== origin) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
