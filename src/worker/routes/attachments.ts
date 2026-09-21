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

/** `inline` keeps the image showing in the page; the name is only what "save as" suggests, and can never carry a path or break the header. */
export function attachmentDisposition(filename: string): string {
  const clean = [...filename]
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f && !'"\\/'.includes(ch);
    })
    .join("")
    .trim()
    .slice(0, 120) || "attachment";
  const ascii = clean.replace(/[^\x20-\x7e]|%/g, "_");
  const encoded = encodeURIComponent(clean).replace(/['()*]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`);
  return `inline; filename="${ascii}"; filename*=UTF-8''${encoded}`;
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
        "Content-Disposition": attachmentDisposition(row.filename),
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
