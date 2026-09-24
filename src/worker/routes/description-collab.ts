import { Hono } from "hono";
import { getServerByName } from "partyserver";
import { descriptionRoomName } from "@shared/description-collab";
import { collabDescriptionsEnabled } from "../lib/feature-flags";
import type { DescriptionRoom } from "../durable-objects/DescriptionRoom";

// Upgrades to the task's DescriptionRoom; same gate as editing the description over REST: a task of the caller's workspace.
export const descriptionCollabRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>().get("/:taskId", async (c) => {
  if (!collabDescriptionsEnabled(c.env)) return c.json({ error: "Not found" }, 404);
  if (c.req.header("Upgrade") !== "websocket") return c.text("Expected WebSocket upgrade", 426);

  const workspaceId = c.get("workspaceId");
  const taskId = c.req.param("taskId");
  const task = await c.env.DB.prepare(`SELECT id FROM tasks WHERE id = ? AND workspace_id = ?`)
    .bind(taskId, workspaceId)
    .first();
  if (!task) return c.json({ error: "Not found" }, 404);

  const room = await getServerByName<Cloudflare.Env, DescriptionRoom>(c.env.DESCRIPTION_ROOM, descriptionRoomName(workspaceId, taskId));
  return room.fetch(c.req.raw);
});
