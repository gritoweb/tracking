import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { CreateSavedReportSchema, type SavedReport } from "@shared/schemas";
import type { SavedReportRow } from "../db/rows";
import { parseJsonColumn } from "../lib/json";

// Config is client-owned JSON (report filters/rounding/grouping) — validated
// only as "an object", same trust boundary as CreateSavedReportSchema's own field.
const configSchema = z.record(z.string(), z.unknown());

function formatSavedReport(row: SavedReportRow): SavedReport {
  return {
    id: row.id,
    name: row.name,
    config: parseJsonColumn(row.config, configSchema, {}, "saved_reports.config"),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Per-user saved report views (workspace + user scoped).
export const savedReportsRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const { results } = await c.env.DB.prepare(
      `SELECT id, name, config, created_at, updated_at
       FROM saved_reports
       WHERE workspace_id = ? AND user_id = ?
       ORDER BY created_at DESC`
    )
      .bind(workspaceId, userId)
      .all<SavedReportRow>();

    return c.json(results.map(formatSavedReport), 200);
  })
  .post("/", zValidator("json", CreateSavedReportSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const { name, config } = c.req.valid("json");
    const id = crypto.randomUUID();

    await c.env.DB.prepare(
      `INSERT INTO saved_reports (id, workspace_id, user_id, name, config)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(id, workspaceId, userId, name, JSON.stringify(config))
      .run();

    const row = await c.env.DB.prepare(
      `SELECT id, name, config, created_at, updated_at FROM saved_reports WHERE id = ?`
    )
      .bind(id)
      .first<SavedReportRow>();
    if (!row) return c.json({ error: "saved report insert did not produce a readable row" }, 500);

    return c.json(formatSavedReport(row), 201);
  })
  .delete("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const id = c.req.param("id");
    await c.env.DB.prepare(
      `DELETE FROM saved_reports WHERE id = ? AND workspace_id = ? AND user_id = ?`
    )
      .bind(id, workspaceId, userId)
      .run();
    return c.body(null, 204);
  });
