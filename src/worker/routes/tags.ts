import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CreateTagSchema, UpdateTagSchema, type Tag } from "@shared/schemas";
import { nextUnusedColor } from "@shared/colors";
import type { TagRow } from "../db/rows";

export const tagsRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string };
}>()
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM tags WHERE workspace_id = ? ORDER BY name ASC`
    )
      .bind(workspaceId)
      .all<TagRow>();

    return c.json(
      results.map(
        (r): Tag => ({
          id: r.id,
          workspaceId: r.workspace_id,
          name: r.name,
          color: r.color ?? "#64748b",
        })
      ),
      200
    );
  })
  .post("/", zValidator("json", CreateTagSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const name = c.req.valid("json").name.trim();

    const existing = await c.env.DB.prepare(
      `SELECT id, color FROM tags WHERE workspace_id = ? AND name = ?`
    )
      .bind(workspaceId, name)
      .first<{ id: string; color: string | null }>();
    if (existing) {
      return c.json({ id: existing.id, workspaceId, name, color: existing.color ?? "#64748b" }, 200);
    }

    const { results: inUse } = await c.env.DB.prepare(
      `SELECT DISTINCT color FROM tags WHERE workspace_id = ?`
    )
      .bind(workspaceId)
      .all<{ color: string | null }>();
    const color = nextUnusedColor(
      inUse.map((r) => r.color).filter((v): v is string => Boolean(v))
    );
    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO tags (id, workspace_id, name, color) VALUES (?, ?, ?, ?)`
    )
      .bind(id, workspaceId, name, color)
      .run();
    return c.json({ id, workspaceId, name, color }, 201);
  })
  .patch("/:id", zValidator("json", UpdateTagSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const { color } = c.req.valid("json");
    await c.env.DB.prepare(
      `UPDATE tags SET color = ? WHERE id = ? AND workspace_id = ?`
    )
      .bind(color, c.req.param("id"), workspaceId)
      .run();
    return c.json({ ok: true }, 200);
  })
  .delete("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    await c.env.DB.prepare(
      `DELETE FROM tags WHERE id = ? AND workspace_id = ?`
    )
      .bind(c.req.param("id"), workspaceId)
      .run();
    return c.json({ ok: true }, 200);
  });
