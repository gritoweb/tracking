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

export const corsMiddleware = cors({
  origin: (origin, c) => {
    if (!origin) return "*";
    return allowedOrigins(c.env as Env).has(origin) ? origin : null;
  },
  allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
});
