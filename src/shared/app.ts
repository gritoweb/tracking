/** Host of an app URL, for copy that shouldn't carry the scheme. */
export function appHost(url: string): string {
  return new URL(url).host;
}

/** Trailing slashes make `${url}/path` a double slash; strip them once, here. */
export function normalizeAppUrl(url: string): string {
  return url.replace(/\/+$/, "");
}
