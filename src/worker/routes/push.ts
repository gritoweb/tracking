import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { PushSubscriptionSchema } from "@shared/schemas";
import { isPushEndpoint, pushConfigured } from "../lib/web-push";
import { notifyUser } from "../lib/notifications";

// Mounted at /api/push — a browser turning notifications on or off for the signed-in person.
export const pushRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  .get("/config", (c) => c.json({ publicKey: pushConfigured(c.env) ? c.env.VAPID_PUBLIC_KEY : null }, 200))
  .post("/subscriptions", zValidator("json", PushSubscriptionSchema), async (c) => {
    const { endpoint } = c.req.valid("json");
    if (!isPushEndpoint(endpoint)) return c.json({ error: "Not a browser push endpoint" }, 400);
    // A browser shared by two accounts belongs to whoever turned notifications on last.
    await c.env.DB.prepare(
      `INSERT INTO push_subscriptions (endpoint, user_id) VALUES (?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id`
    ).bind(endpoint, c.get("userId")).run();
    return c.json({ ok: true }, 200);
  })
  .delete("/subscriptions", zValidator("json", PushSubscriptionSchema), async (c) => {
    await c.env.DB.prepare(`DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?`)
      .bind(c.req.valid("json").endpoint, c.get("userId"))
      .run();
    return c.json({ ok: true }, 200);
  })
  // A real bell notification, so the test travels the same path as every other one.
  .post("/test", async (c) => {
    await notifyUser(c.env, c.get("workspaceId"), c.get("userId"), {
      type: "test",
      title: "Notifications are on",
      body: "This is how TimeTracker tells you when a task needs you.",
      link: null,
    });
    return c.json({ ok: true }, 200);
  });
