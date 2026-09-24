// Tasks: the plan side — list, edit, statuses, comments and image attachments.
import { z } from "zod";
import { commentText } from "@shared/comment-body";
import type { CreateTask, Task, TaskActivity, TaskAttachment, TaskComment, TaskStatus, UpdateTask } from "@shared/schemas";
import {
  ArchiveTaskStatusSchema, CreateTaskCommentSchema, CreateTaskSchema, CreateTaskStatusSchema,
  MoveTaskSchema, UpdateTaskCommentSchema, UpdateTaskSchema, UpdateTaskStatusSchema,
} from "@shared/schemas";
import { findActiveProject } from "../../lib/projects";
import { appUrl } from "../../lib/app-url";
import { taskUrl } from "../links";
import { segment, type BridgeResult } from "../rest-bridge";
import { listableInput, rejected, runListable } from "../batch";
import { DESTRUCTIVE, IdArg, MUTATES, READ_ONLY, ROW_LIMIT, compact, fromBridge, hours, json, refuse, richTextToPlain, type ToolDeps } from "../shared";

/** Largest image a tool accepts, matching the upload route's own limit. */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** How far back create_task looks for the same task before making another: long enough for a retry or a re-ask. */
const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

/** Words shorter than this ("de", "a", "the") match nearly everything, so they don't count. */
const MIN_SEARCH_WORD = 3;

/**
 * Tasks matching any word of `search` (case-insensitive), most words matched first; the column order breaks ties. A person's
 * typo in one word ("tracing" for "tracking") still finds the task through the others.
 */
export function rankBySearch(tasks: Task[], search: string | undefined): Task[] {
  if (!search) return tasks;
  const words = search.toLowerCase().split(/\s+/).filter((w) => w.length >= MIN_SEARCH_WORD);
  if (!words.length) return tasks.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()));
  return tasks
    .map((t, order) => ({ t, order, hits: words.filter((w) => t.name.toLowerCase().includes(w)).length }))
    .filter((r) => r.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.order - b.order)
    .map((r) => r.t);
}

const CATEGORY_ORDER = { not_started: 0, active: 1, completed: 2 } as const;

/** Tasks in the board's column order, first column first; a project's own columns follow by category. */
export function sortByColumn(tasks: Task[], columnOrder: string[]): Task[] {
  const rank = (t: Task) => {
    const i = t.statusId ? columnOrder.indexOf(t.statusId) : -1;
    return i >= 0 ? i : columnOrder.length + (CATEGORY_ORDER[t.statusCategory as keyof typeof CATEGORY_ORDER] ?? 3);
  };
  return [...tasks].sort((a, b) => rank(a) - rank(b));
}

/** A task in a list: what it takes to pick one and link it — notes and the rest come from get_task. Empty fields are left out. */
function taskListView(t: Task, base: string) {
  return {
    id: t.id,
    name: t.name,
    url: taskUrl(base, t.id),
    status: t.statusName,
    project: t.projectName,
    ...(t.dueDate ? { dueDate: t.dueDate } : {}),
    ...(t.priority < 4 ? { priority: t.priority } : {}),
    ...(t.assignees.length ? { assignees: t.assignees.map((a) => a.name) } : {}),
    ...(t.parentId ? { parentId: t.parentId } : {}),
    ...(t.subtaskTotal ? { subtasks: `${t.subtaskDone}/${t.subtaskTotal}` } : {}),
    ...(t.recurRule ? { repeats: t.recurRule } : {}),
    ...(t.active ? {} : { done: true }),
  };
}

/** A task as a model reads it: plain-text notes, hours, names instead of colours. */
function taskView(t: Task, base: string) {
  return {
    id: t.id,
    name: t.name,
    url: taskUrl(base, t.id),
    notes: richTextToPlain(t.description),
    project: { id: t.projectId, name: t.projectName },
    status: { id: t.statusId, name: t.statusName, category: t.statusCategory },
    done: !t.active,
    dueDate: t.dueDate,
    priority: t.priority,
    parentId: t.parentId,
    subtasks: { total: t.subtaskTotal, done: t.subtaskDone },
    assignees: t.assignees.map((a) => ({ userId: a.userId, name: a.name })),
    estimatedHours: t.estimatedSeconds === null ? null : hours(t.estimatedSeconds),
    trackedHours: hours(t.trackedSeconds),
    repeats: t.recurRule,
    completedAt: t.completedAt,
  };
}

function commentView(c: TaskComment, base: string) {
  return {
    id: c.id,
    url: taskUrl(base, c.taskId, "comments"),
    author: { userId: c.userId, name: c.userName },
    // A rich comment reads as text too, mentions in the same @[Name](user:ID) form the tools document.
    body: commentText(c.body),
    mentionedUserIds: c.mentionedUserIds,
    attachmentId: c.attachmentId,
    createdAt: c.createdAt,
    editedAt: c.editedAt,
  };
}

export function registerTaskReads(d: ToolDeps): void {
  const { server, env, bridge } = d;
  const absolute = (a: TaskAttachment) => ({ ...a, url: new URL(a.url, appUrl(env)).toString() });

  server.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description:
        "Tasks in the workspace — the plan, not tracked time — in the board's column order (whatever the workspace named its columns; list_task_statuses has them), each with its status and url (notes and full details: get_task). Open tasks only unless `includeDone`, so completed ones are left out. " +
        "\"My tasks\" with no date means ALL of the person's open tasks: assignee `me` and NO dueBy — whatever their due date, or none. Pass dueBy only when the person names a day or period (\"today\", \"this week\"). " +
        "Filter by project, status, assignee (`me` for the key's owner) or due day. Use this to find a taskId before editing, moving, commenting or attaching.",
      inputSchema: {
        projectId: z.string().optional().describe("From list_projects"),
        statusId: z.string().optional().describe("From list_task_statuses"),
        assignee: z.string().optional().describe("A member's userId from list_members, or `me`"),
        search: z.string().trim().min(1).max(200).optional().describe("Words from the task's name, as the person said them (typos are fine): tasks matching any word, best matches first — the one call to find a task the person named"),
        includeDone: z.boolean().default(false).describe("Also return completed tasks"),
        dueBy: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
          .optional()
          .describe("Only tasks due on or before this local day, overdue included. Only when the person named a day or period: today's date for 'today', the week's last day for 'this week'. Omit for 'my tasks'."),
      },
      annotations: READ_ONLY,
    },
    async ({ projectId, statusId, assignee, includeDone, dueBy, search }) => {
      const query = new URLSearchParams();
      if (projectId) query.set("projectId", projectId);
      if (statusId) query.set("statusId", statusId);
      if (assignee) query.set("assignee", assignee);
      if (includeDone) query.set("includeInactive", "true");
      const [tasks, statuses] = await Promise.all([
        bridge<Task[]>("GET", `/api/tasks?${query}`),
        bridge<TaskStatus[]>("GET", "/api/task-statuses"),
      ]);
      const columnOrder = statuses.ok ? statuses.data.map((st) => st.id) : [];
      return fromBridge(tasks, (list) =>
        rankBySearch(
          sortByColumn(list.filter((t) => !dueBy || (t.dueDate !== null && t.dueDate <= dueBy)), columnOrder),
          search
        )
          .slice(0, ROW_LIMIT)
          .map((t) => taskListView(t, appUrl(env)))
      );
    }
  );

  server.registerTool(
    "get_task",
    {
      title: "Get one task",
      description: "One task in full — notes, status, due date, assignees, subtasks and tracked hours — plus its subtasks.",
      inputSchema: { taskId: IdArg("task") },
      annotations: READ_ONLY,
    },
    async ({ taskId }) => {
      const [task, subtasks] = await Promise.all([
        bridge<Task>("GET", `/api/tasks/${segment(taskId)}`),
        bridge<Task[]>("GET", `/api/tasks?${new URLSearchParams({ parentId: taskId, includeInactive: "true" })}`),
      ]);
      if (!task.ok) {
        return task.status === 404 ? refuse(`No task with id ${taskId} in this workspace. Call list_tasks to find it.`) : fromBridge(task);
      }
      return json(
        compact({
          ...taskView(task.data, appUrl(env)),
          subtaskList: subtasks.ok ? subtasks.data.map((t) => taskListView(t, appUrl(env))) : [],
        })
      );
    }
  );

  server.registerTool(
    "list_task_statuses",
    {
      title: "List task statuses",
      description:
        "The board's columns in order, with each one's category (not_started, active, completed) and which is the default for new tasks. " +
        "Before moving or creating a task in a column, call this with THAT task's projectId: a project may have its own columns, and a task only accepts a column of its own board (any other is refused, with the valid ones listed). " +
        "Names are whatever the workspace chose, in any language — never assume one exists.",
      inputSchema: { projectId: z.string().optional().describe("Return this project's own columns when it has forked them (from list_projects)") },
      annotations: READ_ONLY,
    },
    async ({ projectId }) =>
      fromBridge(
        await bridge("GET", `/api/task-statuses${projectId ? `?projectId=${segment(projectId)}` : ""}`)
      )
  );

  server.registerTool(
    "list_task_comments",
    {
      title: "List a task's comments",
      description:
        "A task's comments, oldest first — the newest 100 by default. Comments are flat, there are no replies or threads. " +
        "To read further back, pass `before` with the id of the oldest comment you already have.",
      inputSchema: {
        taskId: IdArg("task"),
        limit: z.number().int().min(1).max(200).optional().describe("How many of the newest comments to return (default 100)."),
        before: z.string().min(1).optional().describe("A comment id: return only comments older than it."),
      },
      annotations: READ_ONLY,
    },
    async ({ taskId, limit, before }) => {
      const query = new URLSearchParams();
      if (limit) query.set("limit", String(limit));
      if (before) query.set("before", before);
      const suffix = query.size ? `?${query}` : "";
      return fromBridge(await bridge<TaskComment[]>("GET", `/api/tasks/${segment(taskId)}/comments${suffix}`), (list) =>
        list.map((c) => commentView(c, appUrl(env)))
      );
    }
  );

  server.registerTool(
    "list_task_activity",
    {
      title: "List a task's history",
      description:
        "What changed on a task and who changed it, oldest first: status, due date, priority and assignee changes (the same lines the app shows between the comments). Comments themselves come from list_task_comments.",
      inputSchema: { taskId: IdArg("task") },
      annotations: READ_ONLY,
    },
    async ({ taskId }) =>
      fromBridge(await bridge<TaskActivity[]>("GET", `/api/tasks/${segment(taskId)}/activity`), (list) =>
        list.map((a) => ({ by: a.userName, change: a.kind, from: a.from, to: a.to, at: a.createdAt }))
      )
  );

  server.registerTool(
    "list_task_attachments",
    {
      title: "List a task's attachments",
      description: "The images attached to a task, with a download URL that needs a signed-in session in the app.",
      inputSchema: { taskId: IdArg("task") },
      annotations: READ_ONLY,
    },
    async ({ taskId }) =>
      fromBridge(await bridge<TaskAttachment[]>("GET", `/api/tasks/${segment(taskId)}/attachments`), (list) =>
        list.map(absolute)
      )
  );
}

export function registerTaskWrites(d: ToolDeps): void {
  const { server, env, db, workspaceId, bridge } = d;
  const view = (t: Task) => taskView(t, appUrl(env));

  // One implementation per action, shared by the single-item tool and its batch twin.
  /** An open task with this name, in the same place (project, or parent for a subtask), made in the last few minutes. */
  const recentTwin = async (data: Omit<CreateTask, "id">): Promise<Task | null> => {
    const query = new URLSearchParams(data.parentId ? { parentId: data.parentId } : { projectId: data.projectId });
    const open = await bridge<Task[]>("GET", `/api/tasks?${query}`);
    if (!open.ok) return null;
    const name = data.name.trim().toLowerCase();
    const since = Date.now() - DUPLICATE_WINDOW_MS;
    return (
      open.data.find(
        (t) =>
          t.name.trim().toLowerCase() === name &&
          (t.parentId ?? null) === (data.parentId ?? null) &&
          Date.parse(t.createdAt) >= since
      ) ?? null
    );
  };

  const createOne = async (data: Omit<CreateTask, "id">): Promise<BridgeResult<Task & { alreadyExisted?: true }>> => {
    // Checked here only for a message a model can act on; the route itself creates, notifies and broadcasts.
    if (!(await findActiveProject(db, workspaceId, data.projectId))) {
      return rejected(`No active project with id ${data.projectId} in this workspace. Call list_projects and ask the person which project this task belongs to.`);
    }
    // A model retries or re-asks where a form can't: the same task twice in a few minutes is a duplicate, not a second task.
    const twin = await recentTwin(data);
    if (twin) return { ok: true, status: 200, data: { ...twin, alreadyExisted: true } };
    return bridge<Task>("POST", "/api/tasks", data);
  };
  const createdView = (t: Task & { alreadyExisted?: true }) => ({
    ...view(t),
    ...(t.alreadyExisted
      ? {
          alreadyExisted: true,
          note: "An open task with this name was created here in the last few minutes, so it was returned instead of making a duplicate. To change it, use update_task on this id.",
        }
      : {}),
  });
  const updateOne = ({ taskId, ...patch }: UpdateTask & { taskId: string }) =>
    bridge<Task>("PUT", `/api/tasks/${segment(taskId)}`, patch);
  const moveOne = ({ taskId, statusId, completedOn }: { taskId: string; statusId: string; completedOn?: string }) =>
    bridge<Task>("PATCH", `/api/tasks/${segment(taskId)}/move`, { statusId, ...(completedOn ? { completedOn } : {}) });
  const deleteOne = ({ taskId }: { taskId: string }) => bridge("DELETE", `/api/tasks/${segment(taskId)}`);

  // No `id`: a model must never pick one; the retry guard is for forms, which mint their own.
  const createInput = CreateTaskSchema.omit({ id: true }).shape;
  const updateInput = { taskId: IdArg("task"), ...UpdateTaskSchema.shape };
  const moveInput = { taskId: IdArg("task"), statusId: IdArg("status"), completedOn: MoveTaskSchema.shape.completedOn };
  const deleteInput = { taskId: IdArg("task") };

  const CREATE_DOC =
    "Never re-create a task to change it — use update_task/move_task. An open task with the same name in the same project (or under the same parent) created in the last 10 minutes is returned with `alreadyExisted: true` instead of a duplicate. " +
    "Only when the person asked for this task. Use list_projects for the projectId; never guess it. `assigneeIds` must already be workspace members — ask the person who, rather than guessing; one task for several people is ONE task with several assigneeIds.";
  const UPDATE_DOC =
    "Change a task's name, notes, due date (a local YYYY-MM-DD day), priority (1 highest … 4 none), estimate, parent, project, repeat rule, status or assignees — only the fields passed change. To mark it done, set `active: false` and pass `completedOn` (the person's local date) so a repeating task schedules its next occurrence. `assigneeIds` replaces the whole list.";
  const MOVE_DOC =
    "Exactly what dragging a card on the board does: moving into a completed status closes the subtasks too (reopening brings them back), the card goes to the end of the new column, the change is recorded in the task's history, and the assignees are notified (except whoever's key makes this call). " +
    "Get taskId from list_tasks, then statusId from list_task_statuses called with that task's projectId — only a column of the task's own board is accepted. " +
    "Match the person's words to a column name; if none matches, pick by meaning using the category (to do / not started → not_started, doing → active, done → completed) and say which column you chose, or ask when it's ambiguous. Never invent a column. " +
    "When closing a repeating task, pass `completedOn` (the person's local date) so its next occurrence is scheduled.";
  const DELETE_DOC =
    "Permanently deletes with subtasks, comments and attachments. Only the author or a workspace owner/admin may. Tracked time logged against it stays. Confirm with the person first.";
  const LIST_DOC = " Several at once: pass `items` (each with these same fields) — one call, one approval, a report per item.";

  server.registerTool(
    "create_task",
    {
      title: "Create tasks",
      description: "Add a task to a project's plan — the thing to be done, separate from tracked time. " + CREATE_DOC + LIST_DOC,
      inputSchema: listableInput(createInput, "tasks to create"),
      annotations: MUTATES,
    },
    async (args) => runListable(createInput, args, createOne, createdView)
  );

  server.registerTool(
    "move_task",
    {
      title: "Move tasks to a different status",
      description: "Change which column/status a task is in. " + MOVE_DOC + LIST_DOC,
      inputSchema: listableInput(moveInput, "moves"),
      annotations: MUTATES,
    },
    async (args) => runListable(moveInput, args, moveOne, view)
  );

  server.registerTool(
    "update_task",
    {
      title: "Edit tasks",
      description: UPDATE_DOC + LIST_DOC,
      inputSchema: listableInput(updateInput, "edits"),
      annotations: { ...MUTATES, idempotentHint: true },
    },
    async (args) => runListable(updateInput, args, updateOne, view)
  );

  server.registerTool(
    "delete_task",
    {
      title: "Delete tasks",
      description: "Permanently delete a task. " + DELETE_DOC + LIST_DOC,
      inputSchema: listableInput(deleteInput, "tasks to delete"),
      annotations: DESTRUCTIVE,
    },
    async (args) => runListable(deleteInput, args, deleteOne)
  );

  server.registerTool(
    "add_task_comment",
    {
      title: "Comment on a task",
      description:
        "Add a comment to a task as the key's owner. To tag a person write @[Name](user:ID) in the body, with the id from list_members: the app shows it as a clickable @Name and notifies them (`mentionedUserIds` still works and notifies without a tag in the text). A comment read back carries the same @[Name](user:ID) form. Pass an `attachmentId` from upload_task_attachment to show an image with it.",
      inputSchema: { taskId: IdArg("task"), ...CreateTaskCommentSchema.shape },
      annotations: MUTATES,
    },
    async ({ taskId, ...body }) =>
      fromBridge(await bridge<TaskComment>("POST", `/api/tasks/${segment(taskId)}/comments`, body), (c) => commentView(c, appUrl(env)))
  );

  server.registerTool(
    "edit_task_comment",
    {
      title: "Edit a comment",
      description: "Rewrite a comment's text (and its mentions or image). Only the comment's author can; ids come from list_task_comments.",
      inputSchema: { taskId: IdArg("task"), commentId: IdArg("comment"), ...UpdateTaskCommentSchema.shape },
      annotations: { ...MUTATES, idempotentHint: true },
    },
    async ({ taskId, commentId, ...body }) =>
      fromBridge(
        await bridge<TaskComment>(
          "PATCH",
          `/api/tasks/${segment(taskId)}/comments/${segment(commentId)}`,
          body
        ),
        (c) => commentView(c, appUrl(env))
      )
  );

  server.registerTool(
    "delete_task_comment",
    {
      title: "Delete a comment",
      description: "Remove a comment for good. Its author can, and so can a workspace owner or admin; confirm which one with the person first.",
      inputSchema: { taskId: IdArg("task"), commentId: IdArg("comment") },
      annotations: DESTRUCTIVE,
    },
    async ({ taskId, commentId }) =>
      fromBridge(await bridge("DELETE", `/api/tasks/${segment(taskId)}/comments/${segment(commentId)}`))
  );

  server.registerTool(
    "upload_task_attachment",
    {
      title: "Attach an image to a task",
      description:
        "Upload a PNG, JPEG, WebP or GIF (up to 10 MB) to a task, base64-encoded. The same checks as the app apply: the image is decoded, resized when huge, and refused if it isn't really an image.",
      inputSchema: {
        taskId: IdArg("task"),
        filename: z.string().min(1).max(255),
        contentBase64: z.string().min(1).describe("The file's bytes, base64 (no data: prefix)"),
      },
      annotations: MUTATES,
    },
    async ({ taskId, filename, contentBase64 }) => {
      let bytes: Uint8Array<ArrayBuffer>;
      try {
        bytes = Uint8Array.from(atob(contentBase64.replace(/^data:[^,]*,/, "")), (ch) => ch.charCodeAt(0));
      } catch {
        return refuse("contentBase64 is not valid base64.");
      }
      if (bytes.byteLength > MAX_ATTACHMENT_BYTES) return refuse("Image is larger than 10 MB.");
      const form = new FormData();
      form.set("file", new File([bytes], filename));
      return fromBridge(
        await bridge<TaskAttachment>("POST", `/api/tasks/${segment(taskId)}/attachments`, form),
        (a) => ({ ...a, url: new URL(a.url, appUrl(env)).toString() })
      );
    }
  );

  server.registerTool(
    "delete_task_attachment",
    {
      title: "Delete an attachment",
      description: "Remove an image from a task. Its uploader or a workspace owner/admin can.",
      inputSchema: { attachmentId: IdArg("attachment (from list_task_attachments)") },
      annotations: DESTRUCTIVE,
    },
    async ({ attachmentId }) => fromBridge(await bridge("DELETE", `/api/attachments/${segment(attachmentId)}`))
  );

  server.registerTool(
    "fork_task_statuses",
    {
      title: "Give a project its own statuses",
      description:
        "Copy the workspace's board columns into one project, so that project's columns can then be renamed, added or archived without touching the other projects. Owners and admins only. Get the projectId from list_projects; the result is the project's new column list.",
      inputSchema: { projectId: IdArg("project") },
      annotations: MUTATES,
    },
    async ({ projectId }) => fromBridge(await bridge("POST", "/api/task-statuses/fork", { projectId }))
  );

  server.registerTool(
    "create_task_status",
    {
      title: "Add a board column",
      description: "Add a status column. Workspace owners/admins only. With projectId, the column goes to that project's own set (forking it first).",
      inputSchema: CreateTaskStatusSchema.shape,
      annotations: MUTATES,
    },
    async (body) => fromBridge(await bridge("POST", "/api/task-statuses", body))
  );

  server.registerTool(
    "update_task_status",
    {
      title: "Edit a board column",
      description: "Rename, recolour, recategorise, reorder or make default a status column. Workspace owners/admins only.",
      inputSchema: { statusId: IdArg("status"), ...UpdateTaskStatusSchema.shape },
      annotations: { ...MUTATES, idempotentHint: true },
    },
    async ({ statusId, ...body }) =>
      fromBridge(await bridge("PUT", `/api/task-statuses/${segment(statusId)}`, body))
  );

  server.registerTool(
    "archive_task_status",
    {
      title: "Archive a board column",
      description:
        "Retire a status column. Owners/admins only. A column that still holds tasks needs `moveTo` (another status id) for them; the workspace always keeps one open, one completed and one default column.",
      inputSchema: { statusId: IdArg("status"), ...ArchiveTaskStatusSchema.shape },
      annotations: DESTRUCTIVE,
    },
    async ({ statusId, ...body }) =>
      fromBridge(await bridge("POST", `/api/task-statuses/${segment(statusId)}/archive`, body))
  );
}
