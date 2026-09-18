import { Hono } from "hono";
import { canDeleteAttachment, getMemberRole } from "../lib/permissions";
import type { TaskAttachment } from "@shared/schemas";
import type { TaskAttachmentRow } from "../db/rows";

function formatAttachment(row: TaskAttachmentRow): TaskAttachment {
  return {
    id: row.id,
    filename: row.filename,
    contentType: row.content_type,
    size: row.size,
    width: row.width ?? null,
    height: row.height ?? null,
    url: `/api/attachments/${row.id}`,
    createdAt: row.created_at,
  };
}

// Mounted at /api/attachments — download/delete a single attachment by its own id, workspace-scoped.
export const attachmentsRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  .get("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    const id = c.req.param("id");
    const row = await c.env.DB.prepare(
      `SELECT r2_key, content_type, filename FROM task_attachments WHERE id = ? AND workspace_id = ?`
    ).bind(id, workspaceId).first<{ r2_key: string; content_type: string; filename: string }>();
    if (!row) return c.json({ error: "Not found" }, 404);

    const object = await c.env.ATTACHMENTS.get(row.r2_key);
    if (!object) return c.json({ error: "Not found" }, 404);

    return new Response(object.body, {
      headers: {
        "Content-Type": row.content_type,
        // Private and per-workspace: never cached by a shared/CDN cache.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  })
  .delete("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const id = c.req.param("id");
    const row = await c.env.DB.prepare(
      `SELECT r2_key, user_id FROM task_attachments WHERE id = ? AND workspace_id = ?`
    ).bind(id, workspaceId).first<{ r2_key: string; user_id: string | null }>();
    if (!row) return c.json({ error: "Not found" }, 404);

    const role = await getMemberRole(c.env.DB, workspaceId, userId);
    if (!canDeleteAttachment(role, row.user_id ?? null, userId)) {
      return c.json({ error: "Only the uploader or a workspace manager can delete this attachment" }, 403);
    }

    await c.env.DB.prepare(`DELETE FROM task_attachments WHERE id = ?`).bind(id).run();
    c.executionCtx.waitUntil(c.env.ATTACHMENTS.delete(row.r2_key));
    return c.json({ ok: true }, 200);
  });

export { formatAttachment };
