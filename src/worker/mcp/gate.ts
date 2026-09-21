import { isAllowedOrigin } from "../middleware/cors";
import { SHARED_LIMITS, clientIp, limitRequest, tooManyRequests, type SharedLimiter } from "../middleware/rate-limit";

interface GateOptions {
  max?: number;
  shared?: SharedLimiter;
}

const forbiddenOrigin = () =>
  new Response(JSON.stringify({ error: "Forbidden origin" }), {
    status: 403,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

/**
 * What /mcp checks before it touches the database: a browser Origin must be one of ours (the Streamable HTTP spec's
 * defence against DNS rebinding; MCP clients are programs and send none), then a per-address request limit so
 * key guessing and floods cost nothing but a counter. Returns the refusal, or null to carry on.
 */
export async function mcpGate(request: Request, env: Env, options: GateOptions = {}): Promise<Response | null> {
  const origin = request.headers.get("Origin");
  if (origin && !isAllowedOrigin(env, origin)) return forbiddenOrigin();

  const retryAfter = await limitRequest(env, {
    key: `/mcp:${clientIp(request.headers)}`,
    max: options.max ?? (import.meta.env.DEV ? 1000 : SHARED_LIMITS.MCP_LIMITER),
    windowMs: 60_000,
    // The wrangler limit is fixed per minute, which would throttle the dev server's own e2e runs.
    shared: "shared" in options ? options.shared : import.meta.env.DEV ? undefined : "MCP_LIMITER",
  });
  if (retryAfter !== null) return tooManyRequests(retryAfter);
  return null;
}
