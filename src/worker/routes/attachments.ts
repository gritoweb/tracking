import { Hono } from "hono";

type Row = Record<string, unknown>;

function formatAttachment(row: Row) {
  return {
    id: row.id as string,
    filename: row.filename as string,
    contentType: row.content_type as string,
    size: row.size as number,
    width: (row.width as number | null) ?? null,
    height: (row.height as number | null) ?? null,
    url: `/api/attachments/${row.id as string}`,
    createdAt: row.created_at as string,
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
    ).bind(id, workspaceId).first<Row>();
    if (!row) return c.json({ error: "Not found" }, 404);

    const object = await c.env.ATTACHMENTS.get(row.r2_key as string);
    if (!object) return c.json({ error: "Not found" }, 404);

    return new Response(object.body, {
      headers: {
        "Content-Type": row.content_type as string,
        // Private and per-workspace: never cached by a shared/CDN cache.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  })
  .delete("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    const id = c.req.param("id");
    const row = await c.env.DB.prepare(
      `SELECT r2_key FROM task_attachments WHERE id = ? AND workspace_id = ?`
    ).bind(id, workspaceId).first<Row>();
    if (!row) return c.json({ error: "Not found" }, 404);

    await c.env.DB.prepare(`DELETE FROM task_attachments WHERE id = ?`).bind(id).run();
    c.executionCtx.waitUntil(c.env.ATTACHMENTS.delete(row.r2_key as string));
    return c.json({ ok: true });
  });

export { formatAttachment };
