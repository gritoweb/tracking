import { afterEach, describe, expect, it, vi } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { fromBase64Url, toBase64Url } from "@shared/base64url";
import { isPushEndpoint, sendWebPush, vapidAuthorization } from "./web-push";

const FCM = "https://fcm.googleapis.com/fcm/send/abc123";

async function vapidKeys() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const publicRaw = new Uint8Array((await crypto.subtle.exportKey("raw", pair.publicKey)) as ArrayBuffer);
  const { d } = (await crypto.subtle.exportKey("jwk", pair.privateKey)) as JsonWebKey;
  return { publicKey: pair.publicKey, VAPID_PUBLIC_KEY: toBase64Url(publicRaw), VAPID_PRIVATE_KEY: d! };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("isPushEndpoint", () => {
  it("accepts the browsers' push services over https only", () => {
    expect(isPushEndpoint(FCM)).toBe(true);
    expect(isPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(isPushEndpoint("https://web.push.apple.com/QGx")).toBe(true);
    expect(isPushEndpoint("https://wns2-bl2p.notify.windows.com/w/?token=x")).toBe(true);
  });

  it("refuses anything a client could point the worker at", () => {
    expect(isPushEndpoint("http://fcm.googleapis.com/fcm/send/x")).toBe(false);
    expect(isPushEndpoint("https://evil.example/fcm.googleapis.com")).toBe(false);
    expect(isPushEndpoint("https://fcm.googleapis.com.evil.example/x")).toBe(false);
    expect(isPushEndpoint("https://push.apple.com.evil.example/x")).toBe(false);
    expect(isPushEndpoint("not a url")).toBe(false);
  });
});

describe("vapidAuthorization", () => {
  it("signs an ES256 JWT for the push service's origin that verifies with the public key", async () => {
    const keys = await vapidKeys();
    const env = { ...keys, APP_URL: "https://app.example" } as unknown as Env;
    const now = Date.UTC(2026, 8, 28, 12);

    const header = await vapidAuthorization(env, FCM, now);
    const [, token, k] = header.match(/^vapid t=([^,]+), k=(.+)$/)!;
    expect(k).toBe(keys.VAPID_PUBLIC_KEY);

    const [head, body, signature] = token.split(".");
    const claims = JSON.parse(new TextDecoder().decode(fromBase64Url(body)));
    expect(claims).toEqual({ aud: "https://fcm.googleapis.com", exp: now / 1000 + 12 * 3600, sub: "https://app.example" });
    const valid = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      keys.publicKey,
      fromBase64Url(signature),
      new TextEncoder().encode(`${head}.${body}`)
    );
    expect(valid).toBe(true);
  });
});

describe("sendWebPush", () => {
  async function world() {
    const { db, raw } = createMigratedD1();
    raw.exec(`INSERT INTO push_subscriptions (endpoint, user_id) VALUES
      ('${FCM}', 'u-ana'), ('https://fcm.googleapis.com/fcm/send/gone', 'u-ana'), ('https://evil.example/x', 'u-ana'),
      ('https://fcm.googleapis.com/fcm/send/bo', 'u-bo');`);
    const env = { ...(await vapidKeys()), DB: db, APP_URL: "http://localhost" } as unknown as Env;
    const endpoints = () =>
      (raw.prepare(`SELECT endpoint FROM push_subscriptions ORDER BY endpoint`).all() as { endpoint: string }[]).map((r) => r.endpoint);
    return { env, endpoints };
  }

  it("wakes only this person's push subscriptions, and drops the ones the browser gave up", async () => {
    const { env, endpoints } = await world();
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async (url) => new Response(null, { status: url.endsWith("/gone") ? 410 : 201 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendWebPush(env, "u-ana");

    const called = fetchMock.mock.calls.map(([url]) => url).sort();
    expect(called).toEqual(["https://fcm.googleapis.com/fcm/send/abc123", "https://fcm.googleapis.com/fcm/send/gone"]);
    const init = fetchMock.mock.calls[0][1] as RequestInit & { headers: Record<string, string> };
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toMatch(/^vapid t=/);
    expect(endpoints()).not.toContain("https://fcm.googleapis.com/fcm/send/gone");
    expect(endpoints()).toContain("https://fcm.googleapis.com/fcm/send/bo");
  });

  it("does nothing without VAPID keys", async () => {
    const { env } = await world();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await sendWebPush({ ...env, VAPID_PRIVATE_KEY: "" } as Env, "u-ana");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
