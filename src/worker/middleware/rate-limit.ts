import type { Context, Next } from "hono";

interface Bucket {
  count: number;
  resetAt: number;
}

// Per-isolate counters: exact, free, and enough against one hot source. Not shared across isolates or locations.
const buckets = new Map<string, Bucket>();

/** The bindings in wrangler.jsonc `ratelimits`: one counter per Cloudflare location, shared by every isolate there. */
export type SharedLimiter = "AUTH_LIMITER" | "AI_LIMITER" | "MCP_LIMITER";

/** Every shared limiter is declared with a 60-second period. */
const SHARED_PERIOD_SECONDS = 60;

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
    if (retryAfter !== null) {
      c.header("Retry-After", String(retryAfter));
      return c.json({ message: "Too many requests, try again later" }, 429);
    }
    await next();
  };
}
