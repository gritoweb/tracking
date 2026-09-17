import { Hono } from "hono";
import { formatNotification } from "../lib/notifications";
import type { NotificationRow } from "../db/rows";

// Mounted at /api/notifications — the bell's own list/read endpoints, plus its live socket.
export const notificationsRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM notifications WHERE user_id = ? AND workspace_id = ? ORDER BY created_at DESC LIMIT 50`
    ).bind(userId, workspaceId).all<NotificationRow>();
    const unread = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND workspace_id = ? AND is_read = 0`
    ).bind(userId, workspaceId).first<{ n: number }>();
    return c.json({ notifications: results.map(formatNotification), unreadCount: unread?.n ?? 0 });
  })
  .patch("/:id/read", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    await c.env.DB.prepare(
      `UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ? AND workspace_id = ?`
    ).bind(c.req.param("id"), userId, workspaceId).run();
    return c.json({ ok: true });
  })
  .patch("/read-all", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    await c.env.DB.prepare(
      `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND workspace_id = ? AND is_read = 0`
    ).bind(userId, workspaceId).run();
    return c.json({ ok: true });
  })
  .delete("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    await c.env.DB.prepare(
      `DELETE FROM notifications WHERE id = ? AND user_id = ? AND workspace_id = ?`
    ).bind(c.req.param("id"), userId, workspaceId).run();
    return c.json({ ok: true });
  })
  .delete("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    await c.env.DB.prepare(
      `DELETE FROM notifications WHERE user_id = ? AND workspace_id = ?`
    ).bind(userId, workspaceId).run();
    return c.json({ ok: true });
  })
  // A user's own live inbox — separate Durable Object from the workspace's TimerRoom.
  .get("/ws", async (c) => {
    const upgradeHeader = c.req.header("Upgrade");
    if (upgradeHeader !== "websocket") return c.text("Expected WebSocket upgrade", 426);

    try {
      const id = c.env.NOTIFICATION_ROOM.idFromName(c.get("userId"));
      const stub = c.env.NOTIFICATION_ROOM.get(id);
      return await stub.fetch(c.req.raw);
    } catch (e) {
      console.error("notification ws upgrade failed", { userId: c.get("userId"), error: String(e) });
      return c.text("WebSocket unavailable", 503);
    }
  });
