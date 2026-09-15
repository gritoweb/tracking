import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  CreateTimeEntrySchema,
  UpdateTimeEntrySchema,
  BulkUpdateTimeEntriesSchema,
  BulkDeleteTimeEntriesSchema,
  ENTRY_LIST_LIMIT,
} from "@shared/schemas";

// Autocomplete draws on the last quarter of work — long enough to cover
// recurring monthly tasks, short enough that retired descriptions age out.
const SUGGESTION_LOOKBACK_DAYS = 90;
// Fetched once and filtered client-side, so this is the whole candidate set.
const SUGGESTION_LIMIT = 200;
import {
  broadcast,
  formatEntry,
  getEntryById,
  requestOrigin,
  upsertTags,
  ENTRY_SELECT,
} from "../db/queries";
import { getMemberRole, canManageWorkspace, canWriteEntry, entryScopeUserId } from "../lib/permissions";
import { findActiveProject, PROJECT_REQUIRED_ERROR } from "../lib/projects";


/**
 * Decide an entry's billable flag when the caller didn't state one.
 *
 * `billable` is the only column reports read to compute both billable seconds
 * and invoiced amount (`reports.ts`), and nothing derives it from the project at
 * read time. While `CreateTimeEntrySchema` defaulted it to `false`, every entry
 * created without an explicit flag — the timer bar, the extension, the AI
 * quick-add — landed non-billable no matter which project it was logged
 * against, so a workspace could track a full week on a billable retainer and
 * report zero revenue.
 *
 * An explicit `true`/`false` from the caller always wins; this only fills the
 * gap from the project, which every entry now has (D3).
 */
function resolveBillable(explicit: boolean | undefined, projectBillable: boolean): boolean {
  return explicit ?? projectBillable;
}

/** Ids (already workspace-scoped) the caller may not change: someone else's entry for a member, or anyone else's running timer. */
async function forbiddenEntryIds(
  db: D1Database,
  workspaceId: string,
  userId: string,
  ids: string[]
): Promise<string[]> {
  if (!ids.length) return [];
  const role = await getMemberRole(db, workspaceId, userId);

  const placeholders = ids.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT id, user_id, stop FROM time_entries WHERE workspace_id = ? AND id IN (${placeholders})`
    )
    .bind(workspaceId, ...ids)
    .all<{ id: string; user_id: string | null; stop: string | null }>();

  return results.filter((r) => !canWriteEntry(role, r, userId)).map((r) => r.id);
}

export const timeEntriesRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  // ─── List ─────────────────────────────────────────────────────────────────
  // The Timer is personal for everyone, owners included (D3); the team is reviewed in Reports.
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const { since, until, running } = c.req.query();

    // ?running=true — return only the caller's running entry
    if (running === "true") {
      const { results } = await c.env.DB.prepare(
        `${ENTRY_SELECT} WHERE te.workspace_id = ? AND te.user_id = ? AND te.stop IS NULL GROUP BY te.id LIMIT 1`
      ).bind(workspaceId, userId).all<Record<string, unknown>>();
      return c.json(results.map(formatEntry));
    }

    const now = new Date();
    const defaultSince = new Date(
      now.getFullYear(), now.getMonth(), now.getDate() - 30
    ).toISOString();
    const defaultUntil = new Date(now.getTime() + 86_400_000).toISOString();

    // A member sees only their own hours; an owner or admin sees the workspace (D3).
    const scopeUserId = entryScopeUserId(
      await getMemberRole(c.env.DB, workspaceId, userId),
      userId
    );
    const { results } = await c.env.DB.prepare(
      `${ENTRY_SELECT}
       WHERE te.workspace_id = ? AND (?2 IS NULL OR te.user_id = ?2) AND te.start >= ?3 AND te.start < ?4
       GROUP BY te.id ORDER BY te.start DESC LIMIT ${ENTRY_LIST_LIMIT}`
    )
      .bind(workspaceId, scopeUserId, since ?? defaultSince, until ?? defaultUntil)
      .all<Record<string, unknown>>();

    return c.json(results.map(formatEntry));
  })
  // ─── Description suggestions (autocomplete) ───────────────────────────────
  // Distinct past descriptions plus the project/task/billable combo each was
  // most often logged against, so selecting one refills the whole timer bar.
  // Declared before `/:id` so the literal path isn't swallowed as an entry id.
  // Drawn from the caller's own entries: a teammate's descriptions are their hours.
  .get("/suggestions", async (c) => {
    const workspaceId = c.get("workspaceId");
    const since = new Date(
      Date.now() - SUGGESTION_LOOKBACK_DAYS * 86_400_000
    ).toISOString();

    // `combos` counts each description × project × task × billable pairing;
    // `ranked` picks the dominant pairing per description; `totals` carries the
    // description's overall usage. A plain GROUP BY on description alone would
    // have to pick project/task arbitrarily. Tags come from the description's
    // most recent entry (`latest`/`latest_tags`) rather than its dominant
    // combo — "make it like last time" is the intuition for tag carry-over.
    const { results } = await c.env.DB.prepare(
      `WITH recent AS (
         SELECT id, description, project_id, task_id, billable, start
         FROM time_entries
         WHERE workspace_id = ?1 AND user_id = ?3 AND start >= ?2 AND TRIM(description) <> ''
       ),
       combos AS (
         SELECT description, project_id, task_id, billable,
                COUNT(*) AS n, MAX(start) AS combo_last
         FROM recent
         GROUP BY description, project_id, task_id, billable
       ),
       ranked AS (
         SELECT *, ROW_NUMBER() OVER (
                     PARTITION BY description ORDER BY n DESC, combo_last DESC
                   ) AS rn
         FROM combos
       ),
       totals AS (
         SELECT description, COUNT(*) AS uses, MAX(start) AS last_used
         FROM recent GROUP BY description
       ),
       latest AS (
         SELECT description, id,
                ROW_NUMBER() OVER (
                  PARTITION BY description ORDER BY start DESC
                ) AS rn
         FROM recent
       ),
       latest_tags AS (
         SELECT l.description, GROUP_CONCAT(tg.name) AS tag_names
         FROM latest l
         JOIN time_entry_tags tet ON tet.time_entry_id = l.id
         JOIN tags tg ON tg.id = tet.tag_id
         WHERE l.rn = 1
         GROUP BY l.description
       )
       SELECT t.description, t.uses, t.last_used,
              r.project_id, r.task_id, r.billable,
              p.name AS project_name, p.color AS project_color,
              tk.name AS task_name, lt.tag_names
       FROM totals t
       JOIN ranked r ON r.description = t.description AND r.rn = 1
       LEFT JOIN latest_tags lt ON lt.description = t.description
       LEFT JOIN projects p ON p.id = r.project_id
       LEFT JOIN tasks   tk ON tk.id = r.task_id
       ORDER BY t.last_used DESC
       LIMIT ${SUGGESTION_LIMIT}`
    )
      .bind(workspaceId, since, c.get("userId"))
      .all<Record<string, unknown>>();

    return c.json(
      results.map((r) => ({
        description: r.description as string,
        projectId: (r.project_id as string) ?? null,
        projectName: (r.project_name as string) ?? null,
        projectColor: (r.project_color as string) ?? null,
        taskId: (r.task_id as string) ?? null,
        taskName: (r.task_name as string) ?? null,
        billable: Boolean(r.billable),
        tags: r.tag_names
          ? String(r.tag_names).split(",").filter(Boolean)
          : [],
        uses: Number(r.uses),
        lastUsed: r.last_used as string,
      }))
    );
  })
  // ─── Create ───────────────────────────────────────────────────────────────
  .post("/", zValidator("json", CreateTimeEntrySchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const data = c.req.valid("json");
    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    const project = await findActiveProject(c.env.DB, workspaceId, data.projectId);
    if (!project) return c.json({ error: PROJECT_REQUIRED_ERROR }, 400);
    const billable = resolveBillable(data.billable, project.billable);

    // Stop the caller's running timer; a teammate's keeps going.
    if (!data.stop) {
      await c.env.DB.prepare(
        `UPDATE time_entries
         SET stop = ?, duration = CAST((julianday(?) - julianday(start)) * 86400 + 0.5 AS INTEGER), updated_at = ?
         WHERE workspace_id = ? AND user_id = ? AND stop IS NULL`
      ).bind(data.start, data.start, now, workspaceId, userId).run();
    }

    await c.env.DB.prepare(
      `INSERT INTO time_entries
         (id, workspace_id, user_id, project_id, task_id, description, start, stop, duration, billable, calendar_event_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, workspaceId, userId,
      project.id,
      data.taskId ?? null,
      data.description,
      data.start,
      data.stop ?? null,
      data.stop
        ? Math.round((new Date(data.stop).getTime() - new Date(data.start).getTime()) / 1000)
        : null,
      billable ? 1 : 0,
      data.calendarEventId ?? null,
      now, now
    ).run();

    if (data.tags?.length) {
      await upsertTags(c.env.DB, workspaceId, id, data.tags);
    }

    const entry = await getEntryById(c.env.DB, id, workspaceId);
    c.executionCtx.waitUntil(
      broadcast(c.env, workspaceId, data.stop ? "entries:changed" : "timer:start", entry, requestOrigin(c), userId)
    );
    return c.json(entry, 201);
  })
  // ─── Current running entry ─────────────────────────────────────────────
  .get("/current", async (c) => {
    const { results } = await c.env.DB.prepare(
      `${ENTRY_SELECT} WHERE te.workspace_id = ? AND te.user_id = ? AND te.stop IS NULL GROUP BY te.id ORDER BY te.start DESC LIMIT 1`
    ).bind(c.get("workspaceId"), c.get("userId")).all<Record<string, unknown>>();

    if (!results.length) return c.json(null);
    return c.json(formatEntry(results[0]));
  })
  // ─── Bulk update ──────────────────────────────────────────────────────────
  .patch("/bulk", zValidator("json", BulkUpdateTimeEntriesSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const { ids, patch } = c.req.valid("json");
    const now = new Date().toISOString();

    const forbidden = await forbiddenEntryIds(c.env.DB, workspaceId, userId, ids);
    if (forbidden.length) {
      return c.json(
        { error: "Not your entry", detail: `Can't edit entries logged by someone else: ${forbidden.join(", ")}` },
        403
      );
    }
    if (patch.projectId !== undefined && !(await findActiveProject(c.env.DB, workspaceId, patch.projectId))) {
      return c.json({ error: PROJECT_REQUIRED_ERROR }, 400);
    }

    const fields: string[] = [];
    const values: unknown[] = [];

    if (patch.description !== undefined) { fields.push("description = ?"); values.push(patch.description); }
    if (patch.projectId !== undefined)   { fields.push("project_id = ?");   values.push(patch.projectId); }
    if (patch.taskId !== undefined)      { fields.push("task_id = ?");      values.push(patch.taskId ?? null); }
    if (patch.billable !== undefined)    { fields.push("billable = ?");     values.push(patch.billable ? 1 : 0); }
    fields.push("updated_at = ?");
    values.push(now);

    const placeholders = ids.map(() => "?").join(",");
    if (fields.length > 1) {
      await c.env.DB.prepare(
        `UPDATE time_entries SET ${fields.join(", ")} WHERE workspace_id = ? AND id IN (${placeholders})`
      ).bind(...values, workspaceId, ...ids).run();
    }

    // Replace tags on all affected entries. `time_entry_tags` has no
    // workspace_id, so restrict the delete/insert to entries proven to belong to
    // this workspace — otherwise a caller could rewrite another workspace's tags
    // by passing foreign ids.
    if (patch.tags !== undefined) {
      const { results: ownedEntries } = await c.env.DB.prepare(
        `SELECT id FROM time_entries WHERE workspace_id = ? AND id IN (${placeholders})`
      ).bind(workspaceId, ...ids).all<{ id: string }>();
      for (const { id } of ownedEntries) {
        await c.env.DB.prepare(`DELETE FROM time_entry_tags WHERE time_entry_id = ?`).bind(id).run();
        if (patch.tags.length) {
          await upsertTags(c.env.DB, workspaceId, id, patch.tags);
        }
      }
    }

    c.executionCtx.waitUntil(broadcast(c.env, workspaceId, "entries:changed", null, requestOrigin(c)));
    return c.json({ ok: true, updated: ids.length });
  })
  // ─── Bulk delete ──────────────────────────────────────────────────────────
  .delete("/bulk", zValidator("json", BulkDeleteTimeEntriesSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const { ids } = c.req.valid("json");

    const forbidden = await forbiddenEntryIds(c.env.DB, workspaceId, userId, ids);
    if (forbidden.length) {
      return c.json(
        { error: "Not your entry", detail: `Can't delete entries logged by someone else: ${forbidden.join(", ")}` },
        403
      );
    }

    const placeholders = ids.map(() => "?").join(",");

    await c.env.DB.prepare(
      `DELETE FROM time_entries WHERE workspace_id = ? AND id IN (${placeholders})`
    ).bind(workspaceId, ...ids).run();

    c.executionCtx.waitUntil(broadcast(c.env, workspaceId, "entries:changed", null, requestOrigin(c)));
    return c.json({ ok: true, deleted: ids.length });
  })
  // ─── Get by ID ────────────────────────────────────────────────────────────
  .get("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const entry = await getEntryById(c.env.DB, c.req.param("id"), workspaceId);
    if (!entry) return c.json({ error: "Not found" }, 404);
    // A member opens only their own entries; owner/admin can open anyone's from Reports.
    if (entry.userId !== userId && !canManageWorkspace(await getMemberRole(c.env.DB, workspaceId, userId))) {
      return c.json({ error: "Not found" }, 404);
    }
    return c.json(entry);
  })
  // ─── Update ───────────────────────────────────────────────────────────────
  .put("/:id", zValidator("json", UpdateTimeEntrySchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const id = c.req.param("id");
    const data = c.req.valid("json");
    const now = new Date().toISOString();

    // Verify the entry belongs to this workspace before touching it OR its tags.
    // `time_entry_tags` has no workspace_id column, so without this guard a
    // tags-only PUT would delete/rewrite another workspace's tag associations.
    const owned = await c.env.DB.prepare(
      `SELECT start, stop, user_id FROM time_entries WHERE id = ? AND workspace_id = ?`
    ).bind(id, workspaceId).first<{ start: string; stop: string | null; user_id: string | null }>();
    if (!owned) return c.json({ error: "Not found" }, 404);

    const role = await getMemberRole(c.env.DB, workspaceId, userId);
    if (!canWriteEntry(role, owned, userId)) {
      return c.json(
        { error: owned.stop === null ? "Only the person tracking can change a running timer" : "Not your entry" },
        403
      );
    }
    // Clearing `stop` turns the entry back into a live timer, which only its owner may run.
    if (data.stop === null && owned.stop !== null && owned.user_id !== userId) {
      return c.json({ error: "Only the entry's owner can restart it" }, 403);
    }
    if (data.projectId !== undefined && !(await findActiveProject(c.env.DB, workspaceId, data.projectId))) {
      return c.json({ error: PROJECT_REQUIRED_ERROR }, 400);
    }

    // Validate the range the row will actually have after the patch. The schema's
    // refine can only compare fields present in the body, so a single-field patch
    // — which is what every inline edit sends — slipped past it and let the
    // duration recompute below write a negative value.
    //
    // `<` not `<=`: creating a zero-length entry is rejected by
    // CreateTimeEntrySchema, but one that already exists (a start immediately
    // followed by a stop) must stay editable — otherwise its description could
    // never be corrected.
    const nextStart = data.start ?? owned.start;
    const nextStop = data.stop !== undefined ? data.stop : owned.stop;
    if (nextStop && new Date(nextStop) < new Date(nextStart)) {
      return c.json({ error: "Stop time must be after start time" }, 400);
    }

    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description); }
    if (data.projectId !== undefined)   { fields.push("project_id = ?");   values.push(data.projectId); }
    if (data.taskId !== undefined)      { fields.push("task_id = ?");      values.push(data.taskId ?? null); }
    if (data.start !== undefined)       { fields.push("start = ?");        values.push(data.start); }
    if (data.stop !== undefined)        { fields.push("stop = ?");         values.push(data.stop ?? null); }
    if (data.billable !== undefined)    { fields.push("billable = ?");     values.push(data.billable ? 1 : 0); }
    // Recalculate duration whenever start or stop changes
    if (data.start !== undefined || data.stop !== undefined) {
      fields.push("duration = CAST((julianday(COALESCE(?, stop)) - julianday(COALESCE(?, start))) * 86400 + 0.5 AS INTEGER)");
      values.push(data.stop ?? null, data.start ?? null);
    }
    fields.push("updated_at = ?");
    values.push(now);

    if (fields.length > 1) {
      await c.env.DB.prepare(
        `UPDATE time_entries SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`
      ).bind(...values, id, workspaceId).run();
    }

    if (data.tags !== undefined) {
      await c.env.DB.prepare(`DELETE FROM time_entry_tags WHERE time_entry_id = ?`).bind(id).run();
      if (data.tags.length) await upsertTags(c.env.DB, workspaceId, id, data.tags);
    }

    const entry = await getEntryById(c.env.DB, id, workspaceId);
    c.executionCtx.waitUntil(
      broadcast(c.env, workspaceId, "entries:changed", entry, requestOrigin(c), owned.user_id)
    );
    return c.json(entry);
  })
  // ─── Delete ───────────────────────────────────────────────────────────────
  .delete("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const id = c.req.param("id");

    const owned = await c.env.DB.prepare(
      `SELECT user_id, stop FROM time_entries WHERE id = ? AND workspace_id = ?`
    ).bind(id, workspaceId).first<{ user_id: string | null; stop: string | null }>();
    if (!owned) return c.json({ error: "Not found" }, 404);

    const role = await getMemberRole(c.env.DB, workspaceId, userId);
    if (!canWriteEntry(role, owned, userId)) {
      return c.json(
        { error: owned.stop === null ? "Only the person tracking can delete a running timer" : "Not your entry" },
        403
      );
    }

    await c.env.DB.prepare(
      `DELETE FROM time_entries WHERE id = ? AND workspace_id = ?`
    ).bind(id, workspaceId).run();
    c.executionCtx.waitUntil(
      broadcast(c.env, workspaceId, "entries:changed", null, requestOrigin(c), owned.user_id)
    );
    return c.json({ ok: true });
  })
  // ─── Stop running ─────────────────────────────────────────────────────────
  .patch("/:id/stop", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const id = c.req.param("id");
    const stop = new Date().toISOString();

    const owned = await c.env.DB.prepare(
      `SELECT user_id FROM time_entries WHERE id = ? AND workspace_id = ?`
    ).bind(id, workspaceId).first<{ user_id: string | null }>();
    // A stale id (the extension after a reload) keeps answering null, as it always has.
    if (!owned) return c.json(null);
    if (owned.user_id !== userId) {
      return c.json({ error: "Only the person tracking can stop this timer" }, 403);
    }

    const result = await c.env.DB.prepare(
      `UPDATE time_entries
       SET stop = ?, duration = CAST((julianday(?) - julianday(start)) * 86400 + 0.5 AS INTEGER), updated_at = ?
       WHERE id = ? AND workspace_id = ? AND user_id = ? AND stop IS NULL`
    ).bind(stop, stop, stop, id, workspaceId, userId).run();

    const entry = await getEntryById(c.env.DB, id, workspaceId);
    // Only broadcast if the entry was actually running — prevents false timer:stop
    // events when the extension tries to stop an already-stopped (stale) entry
    if (result.meta.changes > 0) {
      c.executionCtx.waitUntil(broadcast(c.env, workspaceId, "timer:stop", entry, requestOrigin(c), userId));
    }
    return c.json(entry);
  });
