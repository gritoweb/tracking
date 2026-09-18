/** The first path segment ("/tasks/abc/comments" → "tasks", "/" → "/"): what decides whether a page is a different page. */
export function routeSection(pathname: string): string {
  const [segment] = pathname.split("/").filter(Boolean);
  return segment ?? "/";
}
