import { isAllowedOrigin } from "../middleware/cors";
import { clientIp, limitRequest, type SharedLimiter } from "../middleware/rate-limit";

/** Only abuse reaches this: 10 a second from one address, where a person tops out at a few calls a minute and even an agent's burst of tools does not last. Keep it equal to `MCP_LIMITER` in wrangler.jsonc. */
export const MCP_REQUESTS_PER_MINUTE = 600;

interface GateOptions {
  max?: number;
  shared?: SharedLimiter;
}

const refuse = (status: number, error: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers },
  });

/**
 * What /mcp checks before it touches the database: a browser Origin must be one of ours (the Streamable HTTP spec's
 * defence against DNS rebinding; MCP clients are programs and send none), then a per-address request limit so
 * key guessing and floods cost nothing but a counter. Returns the refusal, or null to carry on.
 */
export async function mcpGate(request: Request, env: Env, options: GateOptions = {}): Promise<Response | null> {
  const origin = request.headers.get("Origin");
  if (origin && !isAllowedOrigin(env, origin)) return refuse(403, "Forbidden origin");

  const retryAfter = await limitRequest(env, {
    key: `/mcp:${clientIp(request.headers)}`,
    max: options.max ?? (import.meta.env.DEV ? 1000 : MCP_REQUESTS_PER_MINUTE),
    windowMs: 60_000,
    // The wrangler limit is fixed per minute, which would throttle the dev server's own e2e runs.
    shared: "shared" in options ? options.shared : import.meta.env.DEV ? undefined : "MCP_LIMITER",
  });
  if (retryAfter !== null) return refuse(429, "Too many requests, try again later", { "Retry-After": String(retryAfter) });
  return null;
}
