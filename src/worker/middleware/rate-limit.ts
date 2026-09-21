import type { Context, Next } from "hono";

interface Bucket {
  count: number;
  resetAt: number;
}

// Per-isolate counters: exact, free, and enough against one hot source. Not shared across isolates or locations.
const buckets = new Map<string, Bucket>();

/**
 * The bindings in wrangler.jsonc `ratelimits` (one counter per Cloudflare location, shared by every isolate there) and the
 * requests a minute each allows. This is the one place the numbers live in code; a test holds wrangler.jsonc to them.
 * /mcp's is high on purpose: only a script or an attack reaches 10 a second from one address, and it exists to keep key
 * guessing and floods off the database, not to pace real use.
 */
export const SHARED_LIMITS = { AUTH_LIMITER: 10, AI_LIMITER: 20, MCP_LIMITER: 600 } as const;
export type SharedLimiter = keyof typeof SHARED_LIMITS;

/** Every shared limiter is declared with a 60-second period. */
export const SHARED_PERIOD_SECONDS = 60;

/** The one answer for "too many requests", for the Hono middleware and for /mcp, which runs outside Hono. */
export function tooManyRequests(retryAfterSeconds: number): Response {
  return new Response(JSON.stringify({ message: "Too many requests, try again later" }), {
    status: 429,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Retry-After": String(retryAfterSeconds) },
  });
}

export function clientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
}

function overLocalLimit(key: string, maxPerWindow: number, windowMs: number): number | null {
  const now = Date.now();
  const bucket = buckets.get(key);
  let retryAfter: number | null = null;

  if (bucket && now < bucket.resetAt) {
    if (bucket.count >= maxPerWindow) retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    else bucket.count++;
  } else {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
  }

  // Probabilistic cleanup to prevent unbounded map growth
  if (Math.random() < 0.05) {
    for (const [k, v] of buckets) {
      if (now >= v.resetAt) buckets.delete(k);
    }
  }
  return retryAfter;
}

/** Counts one request against `key`; returns the seconds to wait when it is over the limit, null when it may go on. */
export async function limitRequest(
  env: Env,
  opts: { key: string; max: number; windowMs: number; shared?: SharedLimiter }
): Promise<number | null> {
  const local = overLocalLimit(opts.key, opts.max, opts.windowMs);
  if (local !== null) return local;

  const limiter = opts.shared ? env[opts.shared] : undefined;
  if (!limiter) return null;
  try {
    const { success } = await limiter.limit({ key: opts.key });
    return success ? null : SHARED_PERIOD_SECONDS;
  } catch (error) {
    // The shared counter is a second line: an outage there must not lock everyone out of signing in.
    console.warn("rate-limit: shared limiter unavailable, using the local count only", { limiter: opts.shared, error: String(error) });
    return null;
  }
}

export function rateLimit(maxPerWindow: number, windowMs: number, shared?: SharedLimiter) {
  return async (c: Context, next: Next) => {
    const retryAfter = await limitRequest(c.env as Env, {
      key: `${c.req.path}:${clientIp(c.req.raw.headers)}`,
      max: maxPerWindow,
      windowMs,
      shared,
    });
    if (retryAfter !== null) return tooManyRequests(retryAfter);
    await next();
  };
}

/** A route held to one of the shared limiters, at that limiter's own number. */
export const sharedRateLimit = (limiter: SharedLimiter) => rateLimit(SHARED_LIMITS[limiter], SHARED_PERIOD_SECONDS * 1000, limiter);
