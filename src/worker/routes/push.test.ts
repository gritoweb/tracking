import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { pushRouter } from "./push";

const FCM = "https://fcm.googleapis.com/fcm/send/abc123";

function world(env: Partial<Env> = {}) {
  const { db, raw } = createMigratedD1();
  const fullEnv = { DB: db, APP_URL: "http://localhost", VAPID_PUBLIC_KEY: "pub", VAPID_PRIVATE_KEY: "priv", ...env } as unknown as Env;
  const as = (userId: string) => {
    const app = new Hono<{ Bindings: Env; Variables: { workspaceId: string; userId: string } }>()
      .use("*", async (c, next) => {
        c.set("workspaceId", "ws-A");
        c.set("userId", userId);
        await next();
      })
      .route("/", pushRouter);
    return (path: string, method = "GET", body?: unknown) =>
      app.request(
        `http://localhost${path}`,
        body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { "Content-Type": "application/json" } },
        fullEnv
      );
  };
  const owners = () => raw.prepare(`SELECT endpoint, user_id FROM push_subscriptions`).all();
  return { as, owners };
}

describe("push routes", () => {
  it("hands out the public key only when the server has a pair", async () => {
    expect(await (await world().as("u-ana")("/config")).json()).toEqual({ publicKey: "pub" });
    expect(await (await world({ VAPID_PRIVATE_KEY: "" }).as("u-ana")("/config")).json()).toEqual({ publicKey: null });
  });

  it("refuses an endpoint that isn't a browser push service", async () => {
    const { as, owners } = world();
    const res = await as("u-ana")("/subscriptions", "POST", { endpoint: "https://evil.example/hook" });
    expect(res.status).toBe(400);
    expect(owners()).toEqual([]);
  });

  it("a browser belongs to whoever turned it on last, and only its owner can remove it", async () => {
    const { as, owners } = world();
    await as("u-ana")("/subscriptions", "POST", { endpoint: FCM });
    await as("u-bo")("/subscriptions", "POST", { endpoint: FCM });
    expect(owners()).toEqual([{ endpoint: FCM, user_id: "u-bo" }]);

    await as("u-ana")("/subscriptions", "DELETE", { endpoint: FCM });
    expect(owners()).toHaveLength(1);
    await as("u-bo")("/subscriptions", "DELETE", { endpoint: FCM });
    expect(owners()).toEqual([]);
  });
});
