import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CreateFavoriteSchema, type Favorite } from "@shared/schemas";
import { resolveEntryBillable } from "@shared/billable";
import { z } from "zod";
import type { FavoriteRow } from "../db/rows";
import { parseJsonColumn } from "../lib/json";

// Joins in the project/task display fields so the favorites bar can render a
// colored chip without a second round-trip.
const FAVORITE_SELECT = `
  SELECT f.*, p.name AS project_name, p.color AS project_color, t.name AS task_name
  FROM favorites f
  LEFT JOIN projects p ON p.id = f.project_id AND p.workspace_id = f.workspace_id
  LEFT JOIN tasks t ON t.id = f.task_id AND t.workspace_id = f.workspace_id
`;

const stringArray = z.array(z.string());

function formatFavorite(row: FavoriteRow): Favorite {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    description: row.description ?? "",
    projectId: row.project_id ?? null,
    projectName: row.project_name ?? null,
    projectColor: row.project_color ?? null,
    taskId: row.task_id ?? null,
    taskName: row.task_name ?? null,
    tags: parseJsonColumn(row.tags, stringArray, [], "favorites.tags"),
    billable: Boolean(row.billable),
    createdAt: row.created_at,
  };
}

export const favoritesRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string };
}>()
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const { results } = await c.env.DB.prepare(
      `${FAVORITE_SELECT} WHERE f.workspace_id = ? ORDER BY f.created_at DESC`
    )
      .bind(workspaceId)
      .all<FavoriteRow>();

    return c.json(results.map(formatFavorite));
  })
  .post("/", zValidator("json", CreateFavoriteSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const data = c.req.valid("json");
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `INSERT INTO favorites
         (id, workspace_id, description, project_id, task_id, tags, billable, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        id,
        workspaceId,
        data.description,
        data.projectId ?? null,
        data.taskId ?? null,
        JSON.stringify(data.tags),
        resolveEntryBillable(data.billable) ? 1 : 0,
        now
      )
      .run();

    const { results } = await c.env.DB.prepare(
      `${FAVORITE_SELECT} WHERE f.id = ? AND f.workspace_id = ?`
    )
      .bind(id, workspaceId)
      .all<FavoriteRow>();
    if (!results.length) return c.json({ error: "favorite insert did not produce a readable row" }, 500);

    return c.json(formatFavorite(results[0]), 201);
  })
  .delete("/:id", async (c) => {
    await c.env.DB.prepare(
      `DELETE FROM favorites WHERE id = ? AND workspace_id = ?`
    )
      .bind(c.req.param("id"), c.get("workspaceId"))
      .run();
    return c.json({ ok: true });
  });
