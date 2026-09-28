import { Hono } from "hono";
import { canDeleteAttachment, getMemberRole } from "../lib/permissions";
import type { TaskAttachment } from "@shared/schemas";
import type { TaskAttachmentRow } from "../db/rows";
import { isImageContentType } from "@shared/attachments";
import { stripAttachment, type RichNode } from "@shared/rich-doc";
import { commentIsEmpty } from "@shared/comment-body";
import { broadcast, requestOrigin } from "../db/queries";

function formatAttachment(row: TaskAttachmentRow): TaskAttachment {
  return {
    id: row.id,
    userId: row.user_id ?? null,
    filename: row.filename,
    contentType: row.content_type,
    size: row.size,
    width: row.width ?? null,
    height: row.height ?? null,
    url: `/api/attachments/${row.id}`,
    createdAt: row.created_at,
  };
}

/** `inline` keeps an image showing in the page, anything else downloads; the name can never carry a path or break the header. */
export function attachmentDisposition(filename: string, inline = true): string {
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
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
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
        // Only images render in the page; a document is always a download, never opened as our origin.
        "Content-Disposition": attachmentDisposition(row.filename, isImageContentType(row.content_type)),
        "X-Content-Type-Options": "nosniff",
        // Even if a file is ever opened directly, it runs no script and loads nothing.
        "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
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
      `SELECT r2_key, user_id, task_id FROM task_attachments WHERE id = ? AND workspace_id = ?`
    ).bind(id, workspaceId).first<{ r2_key: string; user_id: string | null; task_id: string }>();
    if (!row) return c.json({ error: "Not found" }, 404);

    const role = await getMemberRole(c.env.DB, workspaceId, userId);
    if (!canDeleteAttachment(role, row.user_id ?? null, userId)) {
      return c.json({ error: "Only the uploader or a workspace manager can delete this attachment" }, 403);
    }

    // The file also leaves every text of the task that shows it, so no broken image or dead card stays behind.
    const serialize = (doc: RichNode) => JSON.stringify(doc.content?.length ? doc : { ...doc, content: [{ type: "paragraph" }] });
    const task = await c.env.DB.prepare(`SELECT description FROM tasks WHERE id = ? AND workspace_id = ?`)
      .bind(row.task_id, workspaceId).first<{ description: string | null }>();
    const { results: comments } = await c.env.DB.prepare(
      `SELECT id, body, attachment_id FROM task_comments WHERE task_id = ? AND workspace_id = ?`
    ).bind(row.task_id, workspaceId).all<{ id: string; body: string; attachment_id: string | null }>();

    const writes: D1PreparedStatement[] = [];
    const description = stripAttachment(task?.description, id);
    if (description) {
      writes.push(c.env.DB.prepare(`UPDATE tasks SET description = ? WHERE id = ? AND workspace_id = ?`)
        .bind(serialize(description), row.task_id, workspaceId));
    }
    let commentsChanged = false;
    for (const comment of comments) {
      const stripped = stripAttachment(comment.body, id);
      const keptAttachment = comment.attachment_id === id ? null : comment.attachment_id;
      if (!stripped && keptAttachment === comment.attachment_id) continue;
      commentsChanged = true;
      const body = stripped ? serialize(stripped) : comment.body;
      // A comment that only carried this file has nothing left to say.
      if (commentIsEmpty(body) && !keptAttachment) {
        writes.push(c.env.DB.prepare(`DELETE FROM task_comments WHERE id = ?`).bind(comment.id));
      } else {
        writes.push(c.env.DB.prepare(`UPDATE task_comments SET body = ?, attachment_id = ? WHERE id = ?`)
          .bind(body, keptAttachment, comment.id));
      }
    }
    writes.push(c.env.DB.prepare(`DELETE FROM task_attachments WHERE id = ?`).bind(id));
    await c.env.DB.batch(writes);
    c.executionCtx.waitUntil(c.env.ATTACHMENTS.delete(row.r2_key));

    if (description) c.executionCtx.waitUntil(broadcast(c.env, workspaceId, "tasks:changed", null, requestOrigin(c)));
    if (commentsChanged) {
      c.executionCtx.waitUntil(
        broadcast(c.env, workspaceId, "task-comments:changed", { taskId: row.task_id }, requestOrigin(c))
      );
    }
    return c.json({ ok: true }, 200);
  });

export { formatAttachment };
