import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  ArchiveTaskStatusSchema,
  CreateTaskStatusSchema,
  UpdateTaskStatusSchema,
} from "@shared/schemas";
import { isManager, MANAGER_ONLY_ERROR } from "../lib/permissions";
import { broadcast, requestOrigin } from "../db/queries";
import {
  ensureProjectFork,
  listStatuses,
  nextStatusColor,
  nextStatusOrder,
  resolveStatus,
} from "../lib/task-statuses";

const NAME_TAKEN = "A status with that name already exists";

/** How many tasks sit in a status right now — the archive guard reads this. */
async function taskCount(db: D1Database, workspaceId: string, statusId: string) {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM tasks WHERE workspace_id = ? AND status_id = ?`)
    .bind(workspaceId, statusId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function nameTaken(
  db: D1Database,
  workspaceId: string,
  projectId: string | null,
  name: string,
  exceptId?: string
) {
  const row = await db
    .prepare(
      `SELECT id FROM task_statuses
        WHERE workspace_id = ? AND ${projectId ? "project_id = ?" : "project_id IS NULL"}
          AND archived = 0 AND lower(name) = lower(?) AND id != ?`
    )
    .bind(...(projectId ? [workspaceId, projectId] : [workspaceId]), name.trim(), exceptId ?? "")
    .first<{ id: string }>();
  return Boolean(row);
}

export const taskStatusesRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  // ─── List — a project's effective set (its own fork, else the workspace global) ─────
  .get("/", async (c) => {
    const projectId = c.req.query("projectId") || null;
    return c.json(await listStatuses(c.env.DB, c.get("workspaceId"), projectId));
  })
  // ─── Fork the global set for a project — idempotent, a no-op if already forked ──────
  .post("/fork", async (c) => {
    const workspaceId = c.get("workspaceId");
    if (!(await isManager(c.env.DB, workspaceId, c.get("userId")))) {
      return c.json({ error: MANAGER_ONLY_ERROR }, 403);
    }
    const { projectId } = await c.req.json<{ projectId?: string }>();
    if (!projectId) return c.json({ error: "projectId is required" }, 400);
    const forked = await ensureProjectFork(c.env.DB, workspaceId, projectId);
    return c.json(forked);
  })
  // ─── Create — global by default; with projectId, forks that project first if needed ──
  .post("/", zValidator("json", CreateTaskStatusSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    if (!(await isManager(c.env.DB, workspaceId, c.get("userId")))) {
      return c.json({ error: MANAGER_ONLY_ERROR }, 403);
    }
    const { name, color, category, projectId = null } = c.req.valid("json");
    if (projectId) await ensureProjectFork(c.env.DB, workspaceId, projectId);
    if (await nameTaken(c.env.DB, workspaceId, projectId, name)) {
      return c.json({ error: NAME_TAKEN }, 409);
    }

    // No colour chosen: the next one not already in this set — same rule as a new project or tag.
    const resolvedColor = color ?? nextStatusColor(await listStatuses(c.env.DB, workspaceId, projectId));

    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO task_statuses (id, workspace_id, project_id, name, color, category, sort_order, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)`
    )
      .bind(
        id,
        workspaceId,
        projectId,
        name.trim(),
        resolvedColor,
        category,
        await nextStatusOrder(c.env.DB, workspaceId, projectId)
      )
      .run();

    c.executionCtx.waitUntil(
      broadcast(c.env, workspaceId, "tasks:changed", null, requestOrigin(c))
    );
    const row = await resolveStatus(c.env.DB, workspaceId, id);
    if (!row) return c.json({ error: "status insert did not produce a readable row" }, 500);
    return c.json(row, 201);
  })
  // ─── Update: rename, recolor, recategorise, reorder, make default ─────────
  .put("/:id", zValidator("json", UpdateTaskStatusSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    if (!(await isManager(c.env.DB, workspaceId, c.get("userId")))) {
      return c.json({ error: MANAGER_ONLY_ERROR }, 403);
    }
    const id = c.req.param("id");
    const data = c.req.valid("json");
    const existing = await resolveStatus(c.env.DB, workspaceId, id);
    if (!existing) return c.json({ error: "Not found" }, 404);

    if (data.name && (await nameTaken(c.env.DB, workspaceId, existing.projectId, data.name, id))) {
      return c.json({ error: NAME_TAKEN }, 409);
    }

    const live = await listStatuses(c.env.DB, workspaceId, existing.projectId);
    const nextCategory = data.category ?? existing.category;

    // Keep at least one open and one completed column, or a task has nowhere to go.
    if (data.category && data.category !== existing.category) {
      const others = live.filter((s) => s.id !== id);
      if (nextCategory === "completed" && !others.some((s) => s.category !== "completed")) {
        return c.json({ error: "Keep at least one status that isn't completed" }, 400);
      }
      if (existing.category === "completed" && !others.some((s) => s.category === "completed")) {
        return c.json({ error: "Keep at least one completed status" }, 400);
      }
    }

    // A completed column can't also be where new tasks land.
    if (data.isDefault === true && nextCategory === "completed") {
      return c.json({ error: "A completed status can't be the default for new tasks" }, 400);
    }

    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (col: string, v: unknown) => { fields.push(`${col} = ?`); values.push(v); };
    if (data.name !== undefined) set("name", data.name.trim());
    if (data.color !== undefined) set("color", data.color);
    if (data.category !== undefined) set("category", data.category);
    if (data.sortOrder !== undefined) set("sort_order", data.sortOrder);
    if (data.isDefault !== undefined) set("is_default", data.isDefault ? 1 : 0);

    const writes: D1PreparedStatement[] = [];
    // Exactly one default per set (global, or a given project's own fork): claiming it takes it from whoever held it.
    if (data.isDefault === true) {
      writes.push(
        c.env.DB.prepare(
          `UPDATE task_statuses SET is_default = 0
             WHERE workspace_id = ? AND ${existing.projectId ? "project_id = ?" : "project_id IS NULL"} AND id != ?`
        ).bind(...(existing.projectId ? [workspaceId, existing.projectId] : [workspaceId]), id)
      );
    }
    if (fields.length) {
      writes.push(
        c.env.DB.prepare(
          `UPDATE task_statuses SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`
        ).bind(...values, id, workspaceId)
      );
    }

    // Recategorising carries every task already here across the done line, both ways.
    if (data.category && data.category !== existing.category) {
      if (nextCategory === "completed") {
        writes.push(
          c.env.DB.prepare(
            `UPDATE tasks SET active = 0, completed_at = COALESCE(completed_at, ?)
              WHERE workspace_id = ? AND status_id = ?`
          ).bind(new Date().toISOString(), workspaceId, id)
        );
      } else if (existing.category === "completed") {
        writes.push(
          c.env.DB.prepare(
            `UPDATE tasks SET active = 1, completed_at = NULL
              WHERE workspace_id = ? AND status_id = ?`
          ).bind(workspaceId, id)
        );
      }
    }

    if (writes.length) await c.env.DB.batch(writes);

    c.executionCtx.waitUntil(
      broadcast(c.env, workspaceId, "tasks:changed", null, requestOrigin(c))
    );
    const updated = await resolveStatus(c.env.DB, workspaceId, id);
    if (!updated) return c.json({ error: "Not found" }, 404);
    return c.json(updated);
  })
  // ─── Archive — never delete; tasks still there must say where they go ───────
  .post("/:id/archive", zValidator("json", ArchiveTaskStatusSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    if (!(await isManager(c.env.DB, workspaceId, c.get("userId")))) {
      return c.json({ error: MANAGER_ONLY_ERROR }, 403);
    }
    const id = c.req.param("id");
    const existing = await resolveStatus(c.env.DB, workspaceId, id);
    if (!existing) return c.json({ error: "Not found" }, 404);

    const live = await listStatuses(c.env.DB, workspaceId, existing.projectId);
    const others = live.filter((s) => s.id !== id);
    if (!others.length) return c.json({ error: "A workspace needs at least one status" }, 400);
    if (existing.category === "completed" && !others.some((s) => s.category === "completed")) {
      return c.json({ error: "Keep at least one completed status" }, 400);
    }
    if (existing.category !== "completed" && !others.some((s) => s.category !== "completed")) {
      return c.json({ error: "Keep at least one status that isn't completed" }, 400);
    }

    const count = await taskCount(c.env.DB, workspaceId, id);
    const moveTo = c.req.valid("json").moveTo;
    let target: Awaited<ReturnType<typeof resolveStatus>> = null;
    if (count > 0) {
      if (!moveTo) {
        return c.json(
          {
            error: `${count} task${count === 1 ? "" : "s"} still in this status — choose where to move them`,
            taskCount: count,
          },
          400
        );
      }
      if (moveTo === id) return c.json({ error: "Pick a different status to move tasks to" }, 400);
      target = await resolveStatus(c.env.DB, workspaceId, moveTo);
      if (!target) return c.json({ error: "Target status not found" }, 400);
    }

    const writes: D1PreparedStatement[] = [];
    if (target) {
      const completed = target.category === "completed";
      writes.push(
        c.env.DB.prepare(
          `UPDATE tasks
              SET status_id = ?,
                  active = ?,
                  completed_at = ${completed ? "COALESCE(completed_at, ?)" : "NULL"}
            WHERE workspace_id = ? AND status_id = ?`
        ).bind(
          target.id,
          completed ? 0 : 1,
          ...(completed ? [new Date().toISOString()] : []),
          workspaceId,
          id
        )
      );
    }
    writes.push(
      c.env.DB.prepare(
        `UPDATE task_statuses SET archived = 1, is_default = 0 WHERE id = ? AND workspace_id = ?`
      ).bind(id, workspaceId)
    );
    // The default flag passes to the next open column instead of being dropped.
    if (existing.isDefault) {
      const heir = others.find((s) => s.category !== "completed") ?? others[0];
      writes.push(
        c.env.DB.prepare(
          `UPDATE task_statuses SET is_default = 1 WHERE id = ? AND workspace_id = ?`
        ).bind(heir.id, workspaceId)
      );
    }
    await c.env.DB.batch(writes);

    c.executionCtx.waitUntil(
      broadcast(c.env, workspaceId, "tasks:changed", null, requestOrigin(c))
    );
    return c.json({ ok: true, moved: target ? count : 0 });
  });
