import { fromBase64Url, toBase64Url as base64Url } from "@shared/base64url";
import { appUrl } from "./app-url";

// The push services browsers subscribe through; any other endpoint is refused so the worker never POSTs to a URL a client chose.
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /\.push\.apple\.com$/,
  /\.notify\.windows\.com$/,
];

const JWT_LIFETIME_SECONDS = 12 * 60 * 60;

export function isPushEndpoint(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return url.protocol === "https:" && PUSH_HOSTS.some((host) => host.test(url.hostname));
}

export function pushConfigured(env: Env): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
}

const encodeJson = (value: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(value)));

/** RFC 8292 `Authorization` header: an ES256 JWT for the push service's origin, signed with the VAPID key. */
export async function vapidAuthorization(env: Env, endpoint: string, now = Date.now()): Promise<string> {
  const publicKey = fromBase64Url(env.VAPID_PUBLIC_KEY);
  const key = await crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: base64Url(publicKey.slice(1, 33)),
      y: base64Url(publicKey.slice(33, 65)),
      d: env.VAPID_PRIVATE_KEY,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
  const unsigned = `${encodeJson({ typ: "JWT", alg: "ES256" })}.${encodeJson({
    aud: new URL(endpoint).origin,
    exp: Math.floor(now / 1000) + JWT_LIFETIME_SECONDS,
    sub: appUrl(env),
  })}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsigned)
  );
  return `vapid t=${unsigned}.${base64Url(new Uint8Array(signature))}, k=${env.VAPID_PUBLIC_KEY}`;
}

/** Wakes every browser this person turned notifications on in; each one's service worker then shows what the bell shows. */
export async function sendWebPush(env: Env, userId: string): Promise<void> {
  if (!pushConfigured(env)) return;
  const { results } = await env.DB.prepare(`SELECT endpoint FROM push_subscriptions WHERE user_id = ?`)
    .bind(userId)
    .all<{ endpoint: string }>();

  await Promise.all(
    results.map(async ({ endpoint }) => {
      if (!isPushEndpoint(endpoint)) return;
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { TTL: "86400", Urgency: "high", Authorization: await vapidAuthorization(env, endpoint) },
          body: "",
        });
        // Gone or unknown: the browser dropped this subscription, so stop sending to it.
        if (res.status === 404 || res.status === 410) {
          await env.DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ?`).bind(endpoint).run();
        } else if (!res.ok) {
          console.warn("web push refused", { status: res.status, host: new URL(endpoint).host });
        }
      } catch (e) {
        console.warn("web push failed", { host: new URL(endpoint).host, error: String(e) });
      }
    })
  );
}
