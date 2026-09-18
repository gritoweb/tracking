import { Hono } from "hono";
import { z } from "zod";
import { canDeleteTask, currentMemberIds, entryScopeUserId, getMemberRole } from "../lib/permissions";
import { zValidator } from "@hono/zod-validator";
import {
  CreateTaskCommentSchema,
  CreateTaskSchema,
  MoveTaskSchema,
  TaskAssigneeSchema,
  UpdateTaskCommentSchema,
  UpdateTaskSchema,
} from "@shared/schemas";
import { nextOccurrence, normalizeRecurRule } from "@shared/task-recurrence";
import { sqliteUtcToIso, sqliteUtcToIsoOrNull } from "../lib/sqlite-time";
import { broadcast, requestOrigin } from "../db/queries";
import type { TaskAttachmentRow, TaskChildRow, TaskCommentRow, TaskJoinRow, TaskRow } from "../db/rows";
import { parseJsonColumn } from "../lib/json";
import {
  completedStatus,
  defaultStatus,
  resolveStatus,
  syncFromCategory,
} from "../lib/task-statuses";
import { ImageDecodeError, processImage, sniffImage } from "../lib/image";
import { formatAttachment } from "./attachments";
import { actorDisplayName, notifyAssigneesOfStatusChange, notifyMentions, notifyNewAssignees } from "../lib/notifications";
import type { CreateTask, Task, TaskComment, TaskStatus } from "@shared/schemas";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const taskAssigneeArray = z.array(TaskAssigneeSchema);

function formatTask(row: TaskJoinRow): Task {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    projectName: row.project_name ?? null,
    projectColor: row.project_color ?? null,
    name: row.name,
    description: row.description ?? null,
    active: Boolean(row.active),
    statusId: row.status_id ?? null,
    statusName: row.status_name ?? null,
    statusColor: row.status_color ?? null,
    statusCategory: row.status_category ?? null,
    estimatedSeconds: row.estimated_seconds ?? null,
    trackedSeconds: row.tracked_seconds ?? 0,
    dueDate: row.due_date ?? null,
    priority: row.priority ?? 4,
    sortOrder: row.sort_order ?? 0,
    parentId: row.parent_id ?? null,
    completedAt: row.completed_at ?? null,
    recurRule: row.recur_rule ?? null,
    boardOrder: row.board_order ?? 0,
    subtaskTotal: row.subtask_total ?? 0,
    subtaskDone: row.subtask_done ?? 0,
    assignees: parseJsonColumn(row.assignees_json, taskAssigneeArray, [], "tasks.assignees_json"),
    createdAt: row.created_at,
  };
}

function formatComment(row: TaskCommentRow): TaskComment {
  const ids = row.mentioned_user_ids.split(",").filter(Boolean);
  const attachmentId = row.attachment_id ?? null;
  return {
    id: row.id,
    taskId: row.task_id,
    userId: row.user_id,
    userName: row.user_name || row.user_email,
    userImage: row.user_image ?? null,
    body: row.body,
    mentionedUserIds: ids,
    attachmentId,
    attachmentUrl: attachmentId ? `/api/attachments/${attachmentId}` : null,
    attachmentFilename: row.attachment_filename ?? null,
    createdAt: sqliteUtcToIso(row.created_at),
    editedAt: sqliteUtcToIsoOrNull(row.edited_at),
  };
}

/**
 * `tracked_seconds` **includes every subtask's tracked time**.
 *
 * A parent is a container: time is logged against the leaf you actually worked
 * on, so without the rollup a parent with five tracked children reads as zero
 * and its estimate bar sits empty all sprint. Correlated subqueries rather than
 * a GROUP BY, so the row survives adding more per-task aggregates without
 * every one of them needing a grouping key.
 */
// A member's tracked time counts only their own hours (D3): `scoped` adds one `te.user_id = ?` binding before the WHERE's.
function taskSelect(scoped: boolean): string {
  return `
  SELECT tk.*,
    p.name AS project_name, p.color AS project_color,
    s.name AS status_name, s.color AS status_color, s.category AS status_category,
    (SELECT COALESCE(SUM(te.duration), 0) FROM time_entries te
       WHERE te.workspace_id = tk.workspace_id AND te.stop IS NOT NULL${scoped ? " AND te.user_id = ?" : ""}
         AND (te.task_id = tk.id
              OR te.task_id IN (SELECT c.id FROM tasks c WHERE c.parent_id = tk.id))
    ) AS tracked_seconds,
    (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = tk.id) AS subtask_total,
    (SELECT COUNT(*) FROM tasks c WHERE c.parent_id = tk.id AND c.active = 0) AS subtask_done,
    (SELECT json_group_array(json_object('userId', ta.user_id, 'name', COALESCE(u.name, u.email), 'image', u.image))
       FROM task_assignees ta JOIN "user" u ON u.id = ta.user_id
      WHERE ta.task_id = tk.id
        AND EXISTS (SELECT 1 FROM "member" m WHERE m.organizationId = tk.workspace_id AND m.userId = ta.user_id)
    ) AS assignees_json
  FROM tasks tk
  LEFT JOIN projects p ON p.id = tk.project_id AND p.workspace_id = tk.workspace_id
  LEFT JOIN task_statuses s ON s.id = tk.status_id AND s.workspace_id = tk.workspace_id
`;
}

async function taskScope(c: { env: Env; get: (key: "workspaceId" | "userId") => string }) {
  const userId = c.get("userId");
  return entryScopeUserId(await getMemberRole(c.env.DB, c.get("workspaceId"), userId), userId);
}

async function readTask(
  db: D1Database,
  id: string,
  workspaceId: string,
  scopeUserId: string | null
): Promise<TaskJoinRow | null> {
  const { results } = await db
    .prepare(`${taskSelect(scopeUserId !== null)} WHERE tk.id = ? AND tk.workspace_id = ?`)
    .bind(...(scopeUserId ? [scopeUserId] : []), id, workspaceId)
    .all<TaskJoinRow>();
  return results.length ? results[0] : null;
}

/** The REST `POST /` handler and the MCP `create_task` tool both go through this — one implementation. */
export async function createTask(
  db: D1Database,
  workspaceId: string,
  data: CreateTask,
  scopeUserId: string | null,
  createdBy: string
): Promise<{ task: Task } | { error: string }> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  let parentId: string | null = null;
  let projectId = data.projectId;
  if (data.parentId) {
    const parent = await resolveParent(db, data.parentId, workspaceId);
    if (!parent) return { error: "Parent task not found, or is itself a subtask" };
    parentId = parent.id;
    // A subtask always belongs to its parent's project — the row inherits the
    // project badge, so letting the two diverge would render a lie.
    projectId = parent.projectId;
  }

  // Recurrence lives on the thing you actually schedule. A repeating subtask
  // would spawn siblings inside a parent that never repeats.
  const recurRule = parentId ? null : normalizeRecurRule(data.recurRule);

  // A subtask is born in its own project's default too, never in its parent's column.
  const status = data.statusId
    ? await resolveStatus(db, workspaceId, data.statusId)
    : await defaultStatus(db, workspaceId, projectId);
  if (!status) return { error: "Status not found" };
  const born = syncFromCategory(status.category, true, null);

  await db.prepare(
    `INSERT INTO tasks
       (id, workspace_id, project_id, name, description, active, estimated_seconds,
        due_date, priority, sort_order, board_order, status_id, completed_at,
        parent_id, recur_rule, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    workspaceId,
    projectId,
    data.name,
    data.description ?? null,
    born.active,
    data.estimatedSeconds ?? null,
    data.dueDate ?? null,
    data.priority ?? 4,
    await nextSortOrder(db, workspaceId, projectId),
    await nextBoardOrder(db, workspaceId, status.id),
    status.id,
    born.completedAt,
    parentId,
    recurRule,
    createdBy,
    now
  ).run();

  if (data.assigneeIds) await setAssignees(db, workspaceId, id, data.assigneeIds);

  const row = await readTask(db, id, workspaceId, scopeUserId);
  if (!row) return { error: "Task created but could not be read back" };
  return { task: formatTask(row) };
}

/** The MCP `move_task` tool's own minimal path to a status change — the REST routes' board-drag and dialog-save paths have more surface (subtask cascade, recurrence spawn) this doesn't need. */
export async function moveTaskStatus(
  db: D1Database,
  workspaceId: string,
  taskId: string,
  statusId: string,
  scopeUserId: string | null
): Promise<{ task: Task; previousStatusId: string | null } | { error: string }> {
  const existing = await db.prepare(`SELECT * FROM tasks WHERE id = ? AND workspace_id = ?`)
    .bind(taskId, workspaceId).first<TaskRow>();
  if (!existing) return { error: "Task not found" };

  const status = await resolveStatus(db, workspaceId, statusId);
  if (!status) return { error: "Status not found" };

  const { active, completedAt } = syncFromCategory(
    status.category,
    Boolean(existing.active),
    existing.completed_at ?? null
  );
  await db.prepare(
    `UPDATE tasks SET status_id = ?, active = ?, completed_at = ? WHERE id = ? AND workspace_id = ?`
  ).bind(status.id, active, completedAt, taskId, workspaceId).run();

  const row = await readTask(db, taskId, workspaceId, scopeUserId);
  if (!row) return { error: "Task moved but could not be read back" };
  return { task: formatTask(row), previousStatusId: existing.status_id ?? null };
}

/**
 * Resolve a requested parent to a real, same-workspace, **top-level** task.
 *
 * One level only. Nesting past that turns a task list into a file tree, and time
 * tracked against a fourth-level leaf can't be reported against anything a
 * client would recognise. Returns `undefined` when the parent is unusable, which
 * the callers turn into a 400 rather than silently flattening.
 */
async function resolveParent(
  db: D1Database,
  parentId: string,
  workspaceId: string
): Promise<{ id: string; projectId: string } | undefined> {
  const row = await db
    .prepare(`SELECT id, project_id, parent_id FROM tasks WHERE id = ? AND workspace_id = ?`)
    .bind(parentId, workspaceId)
    .first<{ id: string; project_id: string; parent_id: string | null }>();
  if (!row || row.parent_id) return undefined;
  return { id: row.id, projectId: row.project_id };
}

/** A task plus its direct subtasks, resolved to a real id list — SQLite's `IN (a, (SELECT …))` is scalar and only matches the subquery's first row. */
export async function taskAndSubtaskIds(db: D1Database, workspaceId: string, taskId: string): Promise<string[]> {
  const { results } = await db
    .prepare(`SELECT id FROM tasks WHERE workspace_id = ? AND (id = ? OR parent_id = ?)`)
    .bind(workspaceId, taskId, taskId)
    .all<{ id: string }>();
  return results.map((r) => r.id);
}

/** Replaces a task's whole assignee set; ids that aren't workspace members are dropped, never trusted (D6). */
async function setAssignees(db: D1Database, workspaceId: string, taskId: string, assigneeIds: string[]) {
  const validIds = await currentMemberIds(db, workspaceId, assigneeIds);

  const statements = [db.prepare(`DELETE FROM task_assignees WHERE task_id = ?`).bind(taskId)];
  for (const userId of validIds) {
    statements.push(
      db
        .prepare(
          `INSERT INTO task_assignees (task_id, user_id, workspace_id) VALUES (?, ?, ?)`
        )
        .bind(taskId, userId, workspaceId)
    );
  }
  await db.batch(statements);
}

/** Next free sort key within a project, so a new task lands at the end. */
async function nextSortOrder(db: D1Database, workspaceId: string, projectId: string) {
  const row = await db
    .prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM tasks WHERE workspace_id = ? AND project_id = ?`)
    .bind(workspaceId, projectId)
    .first<{ m: number }>();
  return (row?.m ?? 0) + 1;
}

/** Next free position at the bottom of a board column. */
async function nextBoardOrder(db: D1Database, workspaceId: string, statusId: string) {
  const row = await db
    .prepare(`SELECT COALESCE(MAX(board_order), 0) AS m FROM tasks WHERE workspace_id = ? AND status_id = ?`)
    .bind(workspaceId, statusId)
    .first<{ m: number }>();
  return (row?.m ?? 0) + 1;
}

/** The one place `status_id`/`active`/`completed_at` are decided together — checkbox and board drop both go through here. */
async function resolveStatusChange(
  db: D1Database,
  workspaceId: string,
  existing: TaskRow,
  data: { statusId?: string; active?: boolean }
): Promise<{ status: TaskStatus; active: 0 | 1; completedAt: string | null } | undefined | null> {
  let status: TaskStatus | null;
  if (data.statusId !== undefined) {
    status = await resolveStatus(db, workspaceId, data.statusId);
  } else if (data.active !== undefined) {
    const projectId = existing.project_id ?? null;
    // The checkbox: done goes to the first completed column, reopening to the default.
    status = data.active
      ? await defaultStatus(db, workspaceId, projectId)
      : await completedStatus(db, workspaceId, projectId);
  } else {
    return undefined;
  }
  if (!status) return null; // caller answers 400

  const wasActive = Boolean(existing.active);
  const { active, completedAt } = syncFromCategory(
    status.category,
    wasActive,
    existing.completed_at ?? null
  );
  return { status, active, completedAt };
}

export const tasksRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  // ─── List tasks ───────────────────────────────────────────────────────────
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const { projectId, statusId, includeInactive, assignee } = c.req.query();

    let where = `WHERE tk.workspace_id = ?`;
    const bindings: unknown[] = [workspaceId];

    if (projectId) { where += ` AND tk.project_id = ?`; bindings.push(projectId); }
    if (statusId) { where += ` AND tk.status_id = ?`; bindings.push(statusId); }
    if (!includeInactive) { where += ` AND tk.active = 1`; }
    if (assignee) {
      const assigneeId = assignee === "me" ? c.get("userId") : assignee;
      where += ` AND EXISTS (SELECT 1 FROM task_assignees ta
        JOIN "member" m ON m.organizationId = tk.workspace_id AND m.userId = ta.user_id
        WHERE ta.task_id = tk.id AND ta.user_id = ?)`;
      bindings.push(assigneeId);
    }

    // Ordered so a client that renders the list as-is still gets a sane order:
    // the manual sequence first, then name as the stable tiebreak.
    const scopeUserId = await taskScope(c);
    const { results } = await c.env.DB.prepare(
      `${taskSelect(scopeUserId !== null)} ${where} ORDER BY tk.sort_order ASC, tk.name ASC`
    ).bind(...(scopeUserId ? [scopeUserId] : []), ...bindings).all<TaskJoinRow>();

    return c.json(results.map(formatTask), 200);
  })
  // ─── Create ───────────────────────────────────────────────────────────────
  .post("/", zValidator("json", CreateTaskSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const data = c.req.valid("json");
    const result = await createTask(c.env.DB, workspaceId, data, await taskScope(c), userId);
    if ("error" in result) return c.json({ error: result.error }, 400);

    if (data.assigneeIds?.length) {
      c.executionCtx.waitUntil(
        notifyNewAssignees(
          c.env, workspaceId, result.task.id, result.task.name, userId,
          await actorDisplayName(c.env.DB, userId), data.assigneeIds
        )
      );
    }

    c.executionCtx.waitUntil(
      broadcast(c.env, workspaceId, "tasks:changed", null, requestOrigin(c))
    );
    return c.json(result.task, 201);
  })
  // ─── Update ───────────────────────────────────────────────────────────────
  .put("/:id", zValidator("json", UpdateTaskSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const id = c.req.param("id");
    const data = c.req.valid("json");

    const existing = await c.env.DB.prepare(
      `SELECT * FROM tasks WHERE id = ? AND workspace_id = ?`
    ).bind(id, workspaceId).first<TaskRow>();
    if (!existing) return c.json({ error: "Not found" }, 404);

    const isSubtask = Boolean(existing.parent_id);
    const fields: string[] = [];
    const values: unknown[] = [];
    const set = (col: string, value: unknown) => { fields.push(`${col} = ?`); values.push(value); };

    if (data.name !== undefined)             set("name", data.name);
    if (data.description !== undefined)      set("description", data.description ?? null);
    if (data.estimatedSeconds !== undefined) set("estimated_seconds", data.estimatedSeconds ?? null);
    if (data.dueDate !== undefined)          set("due_date", data.dueDate ?? null);
    if (data.priority !== undefined)         set("priority", data.priority);
    if (data.sortOrder !== undefined)        set("sort_order", data.sortOrder);
    if (data.recurRule !== undefined && !isSubtask) {
      set("recur_rule", data.recurRule === null ? null : normalizeRecurRule(data.recurRule));
    }

    // A subtask's project always follows its parent's (set via parentId below, never directly).
    if (data.projectId !== undefined && !isSubtask) {
      const project = await c.env.DB.prepare(`SELECT id FROM projects WHERE id = ? AND workspace_id = ?`)
        .bind(data.projectId, workspaceId).first();
      if (!project) return c.json({ error: "Project not found" }, 400);
      set("project_id", data.projectId);
    }

    if (data.parentId !== undefined) {
      if (data.parentId === null) {
        set("parent_id", null);
      } else {
        const parent = await resolveParent(c.env.DB, data.parentId, workspaceId);
        // Its own child can't become its parent, and neither can it.
        if (!parent || parent.id === id || (existing.subtask_total ?? 0) > 0) {
          return c.json({ error: "Parent task not found, or is itself a subtask" }, 400);
        }
        set("parent_id", parent.id);
        set("project_id", parent.projectId);
      }
    }

    // `active` and `statusId` are the same decision from two surfaces — one resolver for both.
    const change = await resolveStatusChange(c.env.DB, workspaceId, existing, data);
    if (change === null) return c.json({ error: "Status not found" }, 400);

    const wasActive = Boolean(existing.active);
    const completing = !!change && change.active === 0 && wasActive;
    const reopening = !!change && change.active === 1 && !wasActive;

    if (change) {
      set("status_id", change.status.id);
      set("active", change.active);
      // `active` alone says a task is done but not when. "Completed today", the
      // log-time prompt and the recurrence spawn all read this.
      set("completed_at", change.completedAt);
      // A column change from a form (not a drag) lands at the bottom of the new one.
      if (change.status.id !== existing.status_id) {
        set("board_order", await nextBoardOrder(c.env.DB, workspaceId, change.status.id));
      }
    }

    if (fields.length) {
      await c.env.DB.prepare(
        `UPDATE tasks SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`
      ).bind(...values, id, workspaceId).run();
    }

    if (change && change.status.id !== existing.status_id) {
      c.executionCtx.waitUntil(
        notifyAssigneesOfStatusChange(
          c.env, workspaceId, id, existing.name, userId,
          await actorDisplayName(c.env.DB, userId), change.status.name
        )
      );
    }

    if (data.assigneeIds !== undefined) {
      const { results: previous } = await c.env.DB.prepare(
        `SELECT user_id AS userId FROM task_assignees WHERE task_id = ?`
      ).bind(id).all<{ userId: string }>();
      await setAssignees(c.env.DB, workspaceId, id, data.assigneeIds);

      const previousIds = new Set(previous.map((r) => r.userId));
      const newAssigneeIds = data.assigneeIds.filter((assigneeId) => !previousIds.has(assigneeId));
      if (newAssigneeIds.length) {
        c.executionCtx.waitUntil(
          notifyNewAssignees(
            c.env, workspaceId, id, existing.name, userId,
            await actorDisplayName(c.env.DB, userId), newAssigneeIds
          )
        );
      }
    }

    // Subtasks carry their parent's project badge — moving the parent moves them too.
    if (data.projectId !== undefined && !isSubtask) {
      await c.env.DB.prepare(`UPDATE tasks SET project_id = ? WHERE parent_id = ? AND workspace_id = ?`)
        .bind(data.projectId, id, workspaceId).run();
    }

    // Ticking a parent ticks its children: a parent left "done" over five open
    // subtasks is a list that disagrees with itself. Reopening does the same in
    // reverse, so the round trip is lossless.
    if ((completing || reopening) && !isSubtask && change) {
      // Children follow into the same column, not just the same flag.
      await c.env.DB.prepare(
        `UPDATE tasks SET active = ?, completed_at = ?, status_id = ? WHERE parent_id = ? AND workspace_id = ?`
      ).bind(
        change.active,
        change.completedAt,
        change.status.id,
        id,
        workspaceId
      ).run();
    }

    // ─── Recurrence: spawn the next occurrence on completion ────────────────
    //
    // Here, not on the cron, and measured from `completedOn` — the completing
    // client's own local date. The worker runs in UTC; deriving "the next
    // weekday after today" from its clock sends the whole feature a day out for
    // anyone west of it, which is exactly the trap the calendar sync hit.
    const rule = data.recurRule !== undefined
      ? (data.recurRule === null ? null : normalizeRecurRule(data.recurRule))
      : existing.recur_rule;

    if (completing && !isSubtask && rule && data.completedOn) {
      const due = nextOccurrence(rule, data.completedOn);
      if (due) {
        const spawnId = crypto.randomUUID();
        const now = new Date().toISOString();
        // The next occurrence starts where a fresh task starts, not in the completed column.
        const spawnStatus = await defaultStatus(c.env.DB, workspaceId, existing.project_id);
        const spawnOrder = await nextBoardOrder(c.env.DB, workspaceId, spawnStatus.id);
        await c.env.DB.prepare(
          `INSERT INTO tasks
             (id, workspace_id, project_id, name, description, active, estimated_seconds,
              due_date, priority, sort_order, board_order, status_id, parent_id, recur_rule, created_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
        ).bind(
          spawnId,
          workspaceId,
          existing.project_id,
          existing.name,
          // The notes describe what the task *is*, so every occurrence needs them.
          existing.description ?? null,
          existing.estimated_seconds ?? null,
          due,
          existing.priority ?? 4,
          existing.sort_order ?? 0,
          spawnOrder,
          spawnStatus.id,
          rule,
          now
        ).run();

        // A repeating checklist is only useful if the checklist comes back too.
        const { results: kids } = await c.env.DB.prepare(
          `SELECT name, description, estimated_seconds, priority, sort_order
             FROM tasks WHERE parent_id = ? AND workspace_id = ? ORDER BY sort_order ASC`
        ).bind(id, workspaceId).all<TaskChildRow>();

        if (kids.length) {
          await c.env.DB.batch(
            kids.map((k) =>
              c.env.DB.prepare(
                `INSERT INTO tasks
                   (id, workspace_id, project_id, name, description, active, estimated_seconds,
                    due_date, priority, sort_order, board_order, status_id, parent_id, recur_rule, created_at)
                 VALUES (?, ?, ?, ?, ?, 1, ?, NULL, ?, ?, ?, ?, ?, NULL, ?)`
              ).bind(
                crypto.randomUUID(),
                workspaceId,
                existing.project_id,
                k.name,
                k.description ?? null,
                k.estimated_seconds ?? null,
                k.priority ?? 4,
                k.sort_order ?? 0,
                spawnOrder,
                spawnStatus.id,
                spawnId,
                now
              )
            )
          );
        }

        // The recurrence carries forward with the new occurrence; leaving it on
        // the completed one would spawn a second copy if it were ever reopened
        // and ticked again.
        await c.env.DB.prepare(
          `UPDATE tasks SET recur_rule = NULL WHERE id = ? AND workspace_id = ?`
        ).bind(id, workspaceId).run();
      }
    }

    const row = await readTask(c.env.DB, id, workspaceId, await taskScope(c));
    if (!row) return c.json({ error: "Not found" }, 404);
    c.executionCtx.waitUntil(
      broadcast(c.env, workspaceId, "tasks:changed", null, requestOrigin(c))
    );
    return c.json(formatTask(row), 200);
  })
  // ─── Move on the board — status and order in one write, never two ───────────
  .patch("/:id/move", zValidator("json", MoveTaskSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const id = c.req.param("id");
    const { statusId, boardOrder, completedOn } = c.req.valid("json");

    const existing = await c.env.DB.prepare(
      `SELECT * FROM tasks WHERE id = ? AND workspace_id = ?`
    ).bind(id, workspaceId).first<TaskRow>();
    if (!existing) return c.json({ error: "Not found" }, 404);

    const change = await resolveStatusChange(c.env.DB, workspaceId, existing, { statusId });
    if (!change) return c.json({ error: "Status not found" }, 400);

    const wasActive = Boolean(existing.active);
    const completing = change.active === 0 && wasActive;
    const reopening = change.active === 1 && !wasActive;
    const isSubtask = Boolean(existing.parent_id);

    await c.env.DB.prepare(
      `UPDATE tasks SET status_id = ?, board_order = ?, active = ?, completed_at = ?
        WHERE id = ? AND workspace_id = ?`
    ).bind(change.status.id, boardOrder, change.active, change.completedAt, id, workspaceId).run();

    if (change.status.id !== existing.status_id) {
      c.executionCtx.waitUntil(
        notifyAssigneesOfStatusChange(
          c.env, workspaceId, id, existing.name, userId,
          await actorDisplayName(c.env.DB, userId), change.status.name
        )
      );
    }

    if ((completing || reopening) && !isSubtask) {
      await c.env.DB.prepare(
        `UPDATE tasks SET active = ?, completed_at = ?, status_id = ? WHERE parent_id = ? AND workspace_id = ?`
      ).bind(change.active, change.completedAt, change.status.id, id, workspaceId).run();
    }

    // A drop onto a completed column spawns the next occurrence, same as the checkbox.
    const rule = existing.recur_rule;
    if (completing && !isSubtask && rule && completedOn) {
      const due = nextOccurrence(rule, completedOn);
      if (due) {
        const spawnStatus = await defaultStatus(c.env.DB, workspaceId, existing.project_id);
        await c.env.DB.batch([
          c.env.DB.prepare(
            `INSERT INTO tasks
               (id, workspace_id, project_id, name, description, active, estimated_seconds,
                due_date, priority, sort_order, board_order, status_id, parent_id, recur_rule, created_at)
             VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
          ).bind(
            crypto.randomUUID(),
            workspaceId,
            existing.project_id,
            existing.name,
            existing.description ?? null,
            existing.estimated_seconds ?? null,
            due,
            existing.priority ?? 4,
            existing.sort_order ?? 0,
            await nextBoardOrder(c.env.DB, workspaceId, spawnStatus.id),
            spawnStatus.id,
            rule,
            new Date().toISOString()
          ),
          // The rule moves to the new occurrence, so re-completing the old one can't mint a second.
          c.env.DB.prepare(`UPDATE tasks SET recur_rule = NULL WHERE id = ? AND workspace_id = ?`)
            .bind(id, workspaceId),
        ]);
      }
    }

    const row = await readTask(c.env.DB, id, workspaceId, await taskScope(c));
    if (!row) return c.json({ error: "Not found" }, 404);
    c.executionCtx.waitUntil(
      broadcast(c.env, workspaceId, "tasks:changed", null, requestOrigin(c))
    );
    return c.json(formatTask(row), 200);
  })
  // ─── Delete ───────────────────────────────────────────────────────────────
  .delete("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const id = c.req.param("id");

    const existing = await c.env.DB.prepare(
      `SELECT created_by FROM tasks WHERE id = ? AND workspace_id = ?`
    ).bind(id, workspaceId).first<{ created_by: string | null }>();
    if (!existing) return c.json({ error: "Not found" }, 404);

    const role = await getMemberRole(c.env.DB, workspaceId, userId);
    if (!canDeleteTask(role, existing.created_by ?? null, userId)) {
      return c.json({ error: "Only the task's author or a workspace manager can delete it" }, 403);
    }

    const ids = await taskAndSubtaskIds(c.env.DB, workspaceId, id);
    const placeholders = ids.map(() => "?").join(",");
    const { results: attachments } = await c.env.DB.prepare(
      `SELECT r2_key FROM task_attachments WHERE workspace_id = ? AND task_id IN (${placeholders})`
    ).bind(workspaceId, ...ids).all<{ r2_key: string }>();

    // FK cascade already covers this (PRAGMA foreign_keys = 1 in D1); explicit deletes here only so the R2 keys below can be read before the rows disappear.
    await c.env.DB.batch([
      c.env.DB.prepare(`DELETE FROM task_attachments WHERE workspace_id = ? AND task_id IN (${placeholders})`).bind(workspaceId, ...ids),
      c.env.DB.prepare(`DELETE FROM task_comments WHERE workspace_id = ? AND task_id IN (${placeholders})`).bind(workspaceId, ...ids),
      c.env.DB.prepare(`DELETE FROM tasks WHERE parent_id = ? AND workspace_id = ?`).bind(id, workspaceId),
      c.env.DB.prepare(`DELETE FROM tasks WHERE id = ? AND workspace_id = ?`).bind(id, workspaceId),
    ]);
    for (const a of attachments) {
      c.executionCtx.waitUntil(c.env.ATTACHMENTS.delete(a.r2_key));
    }
    c.executionCtx.waitUntil(
      broadcast(c.env, workspaceId, "tasks:changed", null, requestOrigin(c))
    );
    return c.json({ ok: true }, 200);
  })
  // ─── Attachments (D7) ────────────────────────────────────────────────────
  .get("/:id/attachments", async (c) => {
    const workspaceId = c.get("workspaceId");
    const taskId = c.req.param("id");
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM task_attachments WHERE task_id = ? AND workspace_id = ? ORDER BY created_at ASC`
    ).bind(taskId, workspaceId).all<TaskAttachmentRow>();
    return c.json(results.map(formatAttachment), 200);
  })
  .post("/:id/attachments", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const taskId = c.req.param("id");

    const task = await c.env.DB.prepare(`SELECT id FROM tasks WHERE id = ? AND workspace_id = ?`)
      .bind(taskId, workspaceId).first();
    if (!task) return c.json({ error: "Not found" }, 404);

    const body = await c.req.parseBody();
    const file = body.file;
    if (!(file instanceof File)) return c.json({ error: "Missing file" }, 400);
    if (file.size > MAX_ATTACHMENT_BYTES) {
      return c.json({ error: "Image is larger than 10 MB" }, 400);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniffImage(bytes);
    if (!kind) return c.json({ error: "Only PNG, JPEG, WebP and GIF images are accepted" }, 400);

    let processed;
    try {
      processed = processImage(bytes, kind);
    } catch (e) {
      if (e instanceof ImageDecodeError) return c.json({ error: e.message }, 400);
      throw e;
    }
    const now = new Date();
    const key = `${workspaceId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}`;
    await c.env.ATTACHMENTS.put(key, processed.bytes, {
      httpMetadata: { contentType: processed.contentType },
    });

    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO task_attachments (id, workspace_id, task_id, user_id, r2_key, filename, content_type, size, width, height)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id, workspaceId, taskId, userId, key,
      file.name || "attachment", processed.contentType, processed.bytes.byteLength,
      processed.width, processed.height
    ).run();

    const row = await c.env.DB.prepare(`SELECT * FROM task_attachments WHERE id = ?`).bind(id).first<TaskAttachmentRow>();
    if (!row) return c.json({ error: "attachment insert did not produce a readable row" }, 500);
    return c.json(formatAttachment(row), 201);
  })
  // ─── Comments (D8) — flat, one level, no reply/thread; @mention notifies, nothing else ────
  .get("/:id/comments", async (c) => {
    const workspaceId = c.get("workspaceId");
    const taskId = c.req.param("id");
    const { results } = await c.env.DB.prepare(
      `SELECT tc.*, u.name AS user_name, u.email AS user_email, u.image AS user_image,
              ta.filename AS attachment_filename
         FROM task_comments tc
         JOIN "user" u ON u.id = tc.user_id
         LEFT JOIN task_attachments ta ON ta.id = tc.attachment_id
        WHERE tc.task_id = ? AND tc.workspace_id = ? ORDER BY tc.created_at ASC`
    ).bind(taskId, workspaceId).all<TaskCommentRow>();
    return c.json(results.map(formatComment), 200);
  })
  .post("/:id/comments", zValidator("json", CreateTaskCommentSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const taskId = c.req.param("id");
    const task = await c.env.DB.prepare(`SELECT id, name FROM tasks WHERE id = ? AND workspace_id = ?`)
      .bind(taskId, workspaceId).first<{ id: string; name: string }>();
    if (!task) return c.json({ error: "Not found" }, 404);

    const { body, mentionedUserIds = [], attachmentId } = c.req.valid("json");
    // Never trust an attachment id from the client — it must belong to this task.
    const attachment = attachmentId
      ? await c.env.DB.prepare(`SELECT id FROM task_attachments WHERE id = ? AND task_id = ? AND workspace_id = ?`)
          .bind(attachmentId, taskId, workspaceId).first<{ id: string }>()
      : null;
    // Who's tagged (persisted, shown on the comment) is not who's notified — see below.
    const mentions = await currentMemberIds(c.env.DB, workspaceId, mentionedUserIds);
    // A self-mention is never a notification.
    const notifyTargets = mentions.filter((m) => m !== userId);

    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO task_comments (id, workspace_id, task_id, user_id, body, mentioned_user_ids, attachment_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, workspaceId, taskId, userId, body, mentions.join(","), attachment?.id ?? null).run();

    const row = await c.env.DB.prepare(
      `SELECT tc.*, u.name AS user_name, u.email AS user_email, u.image AS user_image,
              ta.filename AS attachment_filename
         FROM task_comments tc
         JOIN "user" u ON u.id = tc.user_id
         LEFT JOIN task_attachments ta ON ta.id = tc.attachment_id
        WHERE tc.id = ?`
    ).bind(id).first<TaskCommentRow>();
    if (!row) return c.json({ error: "comment insert did not produce a readable row" }, 500);

    if (notifyTargets.length) {
      const author = row.user_name || row.user_email;
      c.executionCtx.waitUntil(
        notifyMentions(c.env, workspaceId, notifyTargets, {
          type: "task_mention",
          title: `${author} mentioned you`,
          body: `${task.name}: ${body}`,
          link: `/tasks/${taskId}`,
        })
      );
    }

    c.executionCtx.waitUntil(
      broadcast(c.env, workspaceId, "task-comments:changed", { taskId }, requestOrigin(c))
    );
    return c.json(formatComment(row), 201);
  })
  .patch("/:id/comments/:commentId", zValidator("json", UpdateTaskCommentSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const taskId = c.req.param("id");
    const commentId = c.req.param("commentId");
    const existing = await c.env.DB.prepare(
      `SELECT user_id FROM task_comments WHERE id = ? AND workspace_id = ?`
    ).bind(commentId, workspaceId).first<{ user_id: string }>();
    if (!existing) return c.json({ error: "Not found" }, 404);
    if (existing.user_id !== userId) return c.json({ error: "Only the author can edit this comment" }, 403);

    const { body, mentionedUserIds = [], attachmentId } = c.req.valid("json");
    const mentions = await currentMemberIds(c.env.DB, workspaceId, mentionedUserIds);
    const attachment = attachmentId
      ? await c.env.DB.prepare(`SELECT id FROM task_attachments WHERE id = ? AND task_id = ? AND workspace_id = ?`)
          .bind(attachmentId, taskId, workspaceId).first<{ id: string }>()
      : null;
    await c.env.DB.prepare(
      `UPDATE task_comments SET body = ?, mentioned_user_ids = ?, attachment_id = ?, edited_at = datetime('now') WHERE id = ?`
    ).bind(body, mentions.join(","), attachment?.id ?? null, commentId).run();

    const row = await c.env.DB.prepare(
      `SELECT tc.*, u.name AS user_name, u.email AS user_email, u.image AS user_image,
              ta.filename AS attachment_filename
         FROM task_comments tc
         JOIN "user" u ON u.id = tc.user_id
         LEFT JOIN task_attachments ta ON ta.id = tc.attachment_id
        WHERE tc.id = ?`
    ).bind(commentId).first<TaskCommentRow>();
    if (!row) return c.json({ error: "Not found" }, 404);
    c.executionCtx.waitUntil(
      broadcast(c.env, workspaceId, "task-comments:changed", { taskId }, requestOrigin(c))
    );
    return c.json(formatComment(row), 200);
  })
  .delete("/:id/comments/:commentId", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const taskId = c.req.param("id");
    const commentId = c.req.param("commentId");
    const existing = await c.env.DB.prepare(
      `SELECT user_id FROM task_comments WHERE id = ? AND workspace_id = ?`
    ).bind(commentId, workspaceId).first<{ user_id: string }>();
    if (!existing) return c.json({ error: "Not found" }, 404);
    if (existing.user_id !== userId) return c.json({ error: "Only the author can delete this comment" }, 403);

    await c.env.DB.prepare(`DELETE FROM task_comments WHERE id = ?`).bind(commentId).run();
    c.executionCtx.waitUntil(
      broadcast(c.env, workspaceId, "task-comments:changed", { taskId }, requestOrigin(c))
    );
    return c.json({ ok: true }, 200);
  });
