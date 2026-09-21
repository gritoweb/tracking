import { appUrl } from "../lib/app-url";
import { cors } from "hono/cors";

// Exact-match allow-list mirroring trustedOrigins in auth.ts. Never
// prefix/suffix-match on the raw origin string: startsWith("http://localhost")
// also matches http://localhost.evil.com, *.workers.dev is registrable by
// anyone, and chrome-extension://* is every extension — only the pinned one is
// ours. Localhost origins are compiled in for dev/e2e builds only.
const allowedOrigins = (env: Env) => new Set<string>([
  appUrl(env),
  // Pinned dev extension ID (manifest "key") — add the Chrome Web Store ID
  // after first publish, same as trustedOrigins in auth.ts.
  "chrome-extension://nogikmhdpnnedmfldanickgpikmifcje",
  ...(import.meta.env.DEV ? ["http://localhost:5173", "http://localhost:8787"] : []),
]);

/** Whether a browser `Origin` is one of ours; a request with no `Origin` at all is not a browser's cross-origin call. */
export function isAllowedOrigin(env: Env, origin: string): boolean {
  return allowedOrigins(env).has(origin);
}

export const corsMiddleware = cors({
  // No Origin means no cross-origin read to permit, so no header rather than a wildcard.
  origin: (origin, c) => (origin && isAllowedOrigin(c.env as Env, origin) ? origin : null),
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
});
