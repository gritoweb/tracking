import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  CreateTimeEntrySchema,
  UpdateTimeEntrySchema,
  BulkUpdateTimeEntriesSchema,
  BulkDeleteTimeEntriesSchema,
  CopyWeekEntriesRequestSchema,
  ENTRY_LIST_LIMIT,
  type CopyWeekEntriesResult,
} from "@shared/schemas";

// Autocomplete draws on the last quarter of work — long enough to cover
// recurring monthly tasks, short enough that retired descriptions age out.
const SUGGESTION_LOOKBACK_DAYS = 90;
// Fetched once and filtered client-side, so this is the whole candidate set.
const SUGGESTION_LIMIT = 200;
import { nextUnusedColor } from "@shared/colors";
import {
  broadcast,
  formatEntry,
  getEntryById,
  requestOrigin,
  upsertTags,
  ENTRY_SELECT,
} from "../db/queries";
import type { TimeEntryJoinRow } from "../db/rows";
import { getMemberRole, canManageWorkspace, canWriteEntry, entryScopeUserId } from "../lib/permissions";
import { findActiveProject, PROJECT_REQUIRED_ERROR } from "../lib/projects";
import { planCopyWeek } from "../lib/copy-week";
import { resolveEntryBillable } from "@shared/billable";
import type { EntrySuggestion } from "@shared/schemas";

/** `GET /suggestions`'s own projection: a description's dominant project/task/billable combo plus its usage stats. */
interface SuggestionRow {
  description: string;
  project_id: string | null;
  project_name: string | null;
  project_color: string | null;
  task_id: string | null;
  task_name: string | null;
  billable: number;
  tag_names: string | null;
  uses: number;
  last_used: string;
}

// D1 allows 100 bound parameters per statement; a chunk plus the fixed binds of a bulk statement stays under it.
const BULK_CHUNK_SIZE = 90;

export const TASK_NOT_FOUND_ERROR = "Task not found in this workspace";

function chunked<T>(items: T[]): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += BULK_CHUNK_SIZE) chunks.push(items.slice(i, i + BULK_CHUNK_SIZE));
  return chunks;
}

const placeholdersFor = (ids: string[]) => ids.map(() => "?").join(",");

export async function taskInWorkspace(db: D1Database, workspaceId: string, taskId: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT id FROM tasks WHERE id = ? AND workspace_id = ?`)
    .bind(taskId, workspaceId)
    .first<{ id: string }>();
  return row !== null;
}

/**
 * Statements that make every listed entry carry exactly `tagNames`: create the missing tags once, drop the
 * old links, link the new ones. Entry ids are re-scoped to the workspace inside each statement, so a foreign
 * id is ignored. Colour choice mirrors `upsertTags`.
 */
async function replaceTagStatements(
  db: D1Database,
  workspaceId: string,
  entryIds: string[],
  tagNames: string[]
): Promise<D1PreparedStatement[]> {
  const names = [...new Set(tagNames)];
  const statements: D1PreparedStatement[] = [];

  if (names.length) {
    const { results: inUse } = await db
      .prepare(`SELECT DISTINCT color FROM tags WHERE workspace_id = ?`)
      .bind(workspaceId)
      .all<{ color: string | null }>();
    const taken = new Set(inUse.map((r) => r.color).filter((c): c is string => Boolean(c)));
    const insertTag = `INSERT OR IGNORE INTO tags (id, workspace_id, name, color) VALUES (?, ?, ?, ?)`;
    for (const name of names) {
      const color = nextUnusedColor(taken);
      taken.add(color);
      statements.push(db.prepare(insertTag).bind(crypto.randomUUID(), workspaceId, name, color));
    }
  }

  for (const part of chunked(entryIds)) {
    statements.push(
      db
        .prepare(
          `DELETE FROM time_entry_tags WHERE time_entry_id IN
             (SELECT id FROM time_entries WHERE workspace_id = ? AND id IN (${placeholdersFor(part)}))`
        )
        .bind(workspaceId, ...part)
    );
  }

  // 2 fixed binds + the tag names + the ids must stay within 100 per statement.
  const linkChunk = Math.max(1, Math.min(BULK_CHUNK_SIZE, 98 - names.length));
  for (let i = 0; names.length && i < entryIds.length; i += linkChunk) {
    const part = entryIds.slice(i, i + linkChunk);
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO time_entry_tags (time_entry_id, tag_id)
           SELECT te.id, tg.id FROM time_entries te, tags tg
           WHERE te.workspace_id = ? AND te.id IN (${placeholdersFor(part)})
             AND tg.workspace_id = ? AND tg.name IN (${placeholdersFor(names)})`
        )
        .bind(workspaceId, ...part, workspaceId, ...names)
    );
  }
  return statements;
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

  const batches = await db.batch<{ id: string; user_id: string | null; stop: string | null }>(
    chunked(ids).map((part) =>
      db
        .prepare(`SELECT id, user_id, stop FROM time_entries WHERE workspace_id = ? AND id IN (${placeholdersFor(part)})`)
        .bind(workspaceId, ...part)
    )
  );

  return batches
    .flatMap((b) => b.results)
    .filter((r) => !canWriteEntry(role, r, userId))
    .map((r) => r.id);
}

export const timeEntriesRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  // ─── List ─────────────────────────────────────────────────────────────────
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const { since, until, running } = c.req.query();

    // ?running=true — return only the caller's running entry
    if (running === "true") {
      const { results } = await c.env.DB.prepare(
        `${ENTRY_SELECT} WHERE te.workspace_id = ? AND te.user_id = ? AND te.stop IS NULL GROUP BY te.id LIMIT 1`
      ).bind(workspaceId, userId).all<TimeEntryJoinRow>();
      return c.json(results.map(formatEntry), 200);
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
      .all<TimeEntryJoinRow>();

    return c.json(results.map(formatEntry), 200);
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
      .all<SuggestionRow>();

    return c.json(
      results.map(
        (r): EntrySuggestion => ({
          description: r.description,
          projectId: r.project_id ?? null,
          projectName: r.project_name ?? null,
          projectColor: r.project_color ?? null,
          taskId: r.task_id ?? null,
          taskName: r.task_name ?? null,
          billable: Boolean(r.billable),
          tags: r.tag_names ? r.tag_names.split(",").filter(Boolean) : [],
          uses: r.uses,
          lastUsed: r.last_used,
        })
      ),
      200
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
    if (data.taskId && !(await taskInWorkspace(c.env.DB, workspaceId, data.taskId))) {
      return c.json({ error: TASK_NOT_FOUND_ERROR }, 400);
    }
    const billable = resolveEntryBillable(data.billable);

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
    if (!entry) return c.json({ error: "entry insert did not produce a readable row" }, 500);
    c.executionCtx.waitUntil(
      broadcast(c.env, workspaceId, data.stop ? "entries:changed" : "timer:start", entry, requestOrigin(c), userId)
    );
    return c.json(entry, 201);
  })
  // ─── Copy a week ────────────────────────────────────────────────────────
  // Replaces the client's N-POST-plus-rollback "copy last week" with one atomic batch.
  .post("/copy-week", zValidator("json", CopyWeekEntriesRequestSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const { sourceWeekStart, targetWeekStart } = c.req.valid("json");

    const outcome = await planCopyWeek(c.env.DB, workspaceId, userId, sourceWeekStart, targetWeekStart);
    if (!outcome.ok) {
      return c.json({ error: outcome.error, entryIds: outcome.entryIds }, 400);
    }
    const { statements, createdIds, tagsByCreatedId } = outcome.plan;
    if (!statements.length) {
      return c.json({ created: [] } satisfies CopyWeekEntriesResult, 200);
    }

    await c.env.DB.batch(statements);
    // Tags aren't part of the atomic batch — same secondary-step shape as a single POST /.
    await Promise.all(
      [...tagsByCreatedId.entries()].map(([id, tags]) => upsertTags(c.env.DB, workspaceId, id, tags))
    );

    const { results } = await c.env.DB.prepare(
      `${ENTRY_SELECT} WHERE te.workspace_id = ? AND te.id IN (${createdIds.map(() => "?").join(",")}) GROUP BY te.id ORDER BY te.start ASC`
    )
      .bind(workspaceId, ...createdIds)
      .all<TimeEntryJoinRow>();
    const created = results.map(formatEntry);

    c.executionCtx.waitUntil(
      broadcast(c.env, workspaceId, "entries:changed", { source: "copy-week" }, requestOrigin(c), userId)
    );
    return c.json({ created } satisfies CopyWeekEntriesResult, 201);
  })
  // ─── Current running entry ─────────────────────────────────────────────
  .get("/current", async (c) => {
    const { results } = await c.env.DB.prepare(
      `${ENTRY_SELECT} WHERE te.workspace_id = ? AND te.user_id = ? AND te.stop IS NULL GROUP BY te.id ORDER BY te.start DESC LIMIT 1`
    ).bind(c.get("workspaceId"), c.get("userId")).all<TimeEntryJoinRow>();

    if (!results.length) return c.json(null, 200);
    return c.json(formatEntry(results[0]), 200);
  })
  // ─── Bulk update ──────────────────────────────────────────────────────────
  .patch("/bulk", zValidator("json", BulkUpdateTimeEntriesSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const { ids: requestedIds, patch } = c.req.valid("json");
    const ids = [...new Set(requestedIds)];
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
    if (patch.taskId && !(await taskInWorkspace(c.env.DB, workspaceId, patch.taskId))) {
      return c.json({ error: TASK_NOT_FOUND_ERROR }, 400);
    }

    const fields: string[] = [];
    const values: unknown[] = [];

    if (patch.description !== undefined) { fields.push("description = ?"); values.push(patch.description); }
    if (patch.projectId !== undefined)   { fields.push("project_id = ?");   values.push(patch.projectId); }
    if (patch.taskId !== undefined)      { fields.push("task_id = ?");      values.push(patch.taskId ?? null); }
    if (patch.billable !== undefined)    { fields.push("billable = ?");     values.push(patch.billable ? 1 : 0); }
    fields.push("updated_at = ?");
    values.push(now);

    let updated = 0;
    if (fields.length > 1) {
      const outcomes = await c.env.DB.batch(
        chunked(ids).map((part) =>
          c.env.DB.prepare(
            `UPDATE time_entries SET ${fields.join(", ")} WHERE workspace_id = ? AND id IN (${placeholdersFor(part)})`
          ).bind(...values, workspaceId, ...part)
        )
      );
      updated = outcomes.reduce((sum, o) => sum + (o.meta.changes ?? 0), 0);
    }

    // Replace tags on all affected entries, in one batch. `time_entry_tags` has no
    // workspace_id, so every statement re-scopes the ids to this workspace —
    // otherwise a caller could rewrite another workspace's tags with foreign ids.
    if (patch.tags !== undefined) {
      const statements = await replaceTagStatements(c.env.DB, workspaceId, ids, patch.tags);
      // A tags-only patch runs no UPDATE, so its count is the entries reached.
      const counts = chunked(ids).map((part) =>
        c.env.DB.prepare(
          `SELECT COUNT(*) AS n FROM time_entries WHERE workspace_id = ? AND id IN (${placeholdersFor(part)})`
        ).bind(workspaceId, ...part)
      );
      const outcomes = await c.env.DB.batch<{ n: number }>([...counts, ...statements]);
      if (fields.length <= 1) {
        updated = outcomes.slice(0, counts.length).reduce((sum, o) => sum + (o.results[0]?.n ?? 0), 0);
      }
    }

    c.executionCtx.waitUntil(broadcast(c.env, workspaceId, "entries:changed", null, requestOrigin(c)));
    return c.json({ ok: true, updated }, 200);
  })
  // ─── Bulk delete ──────────────────────────────────────────────────────────
  .delete("/bulk", zValidator("json", BulkDeleteTimeEntriesSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const ids = [...new Set(c.req.valid("json").ids)];

    const forbidden = await forbiddenEntryIds(c.env.DB, workspaceId, userId, ids);
    if (forbidden.length) {
      return c.json(
        { error: "Not your entry", detail: `Can't delete entries logged by someone else: ${forbidden.join(", ")}` },
        403
      );
    }

    const outcomes = await c.env.DB.batch(
      chunked(ids).map((part) =>
        c.env.DB.prepare(
          `DELETE FROM time_entries WHERE workspace_id = ? AND id IN (${placeholdersFor(part)})`
        ).bind(workspaceId, ...part)
      )
    );
    const deleted = outcomes.reduce((sum, o) => sum + (o.meta.changes ?? 0), 0);

    c.executionCtx.waitUntil(broadcast(c.env, workspaceId, "entries:changed", null, requestOrigin(c)));
    return c.json({ ok: true, deleted }, 200);
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
    return c.json(entry, 200);
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
    if (data.taskId && !(await taskInWorkspace(c.env.DB, workspaceId, data.taskId))) {
      return c.json({ error: TASK_NOT_FOUND_ERROR }, 400);
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
    if (!entry) return c.json({ error: "Not found" }, 404);
    c.executionCtx.waitUntil(
      broadcast(c.env, workspaceId, "entries:changed", entry, requestOrigin(c), owned.user_id)
    );
    return c.json(entry, 200);
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
    return c.json({ ok: true }, 200);
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
    if (!owned) return c.json(null, 200);
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
    return c.json(entry, 200);
  });
