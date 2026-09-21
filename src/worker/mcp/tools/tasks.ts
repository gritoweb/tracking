// Tasks: the plan side — list, edit, statuses, comments and image attachments.
import { z } from "zod";
import type { Task, TaskAttachment, TaskComment } from "@shared/schemas";
import {
  ArchiveTaskStatusSchema, CreateTaskCommentSchema, CreateTaskSchema, CreateTaskStatusSchema,
  UpdateTaskCommentSchema, UpdateTaskSchema, UpdateTaskStatusSchema,
} from "@shared/schemas";
import { findActiveProject } from "../../lib/projects";
import { createTask, moveTaskStatus } from "../../routes/tasks";
import { actorDisplayName, notifyAssigneesOfStatusChange, notifyNewAssignees } from "../../lib/notifications";
import { appUrl } from "../../lib/app-url";
import { taskUrl } from "../links";
import { segment } from "../rest-bridge";
import { DESTRUCTIVE, IdArg, MUTATES, READ_ONLY, ROW_LIMIT, fromBridge, hours, json, refuse, richTextToPlain, type ToolDeps } from "../shared";

/** Largest image a tool accepts, matching the upload route's own limit. */
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

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
    body: c.body,
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
        "Tasks in the workspace — the plan, not tracked time. Open tasks only unless `includeDone`. Filter by project, status, assignee (`me` for the key's owner) or due day. Use this to find a taskId before editing, moving, commenting or attaching, and with assignee `me` + dueBy today for \"what do I have today\".",
      inputSchema: {
        projectId: z.string().optional().describe("From list_projects"),
        statusId: z.string().optional().describe("From list_task_statuses"),
        assignee: z.string().optional().describe("A member's userId from list_members, or `me`"),
        includeDone: z.boolean().default(false).describe("Also return completed tasks"),
        dueBy: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
          .optional()
          .describe("Only tasks due on or before this local day, overdue included — pass today for 'what do I have today'"),
      },
      annotations: READ_ONLY,
    },
    async ({ projectId, statusId, assignee, includeDone, dueBy }) => {
      const query = new URLSearchParams();
      if (projectId) query.set("projectId", projectId);
      if (statusId) query.set("statusId", statusId);
      if (assignee) query.set("assignee", assignee);
      if (includeDone) query.set("includeInactive", "true");
      return fromBridge(await bridge<Task[]>("GET", `/api/tasks?${query}`), (tasks) =>
        tasks
          .filter((t) => !dueBy || (t.dueDate !== null && t.dueDate <= dueBy))
          .slice(0, ROW_LIMIT)
          .map((t) => taskView(t, appUrl(env)))
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
      const result = await bridge<Task[]>("GET", "/api/tasks?includeInactive=true");
      if (!result.ok) return fromBridge(result);
      const task = result.data.find((t) => t.id === taskId);
      if (!task) return refuse(`No task with id ${taskId} in this workspace. Call list_tasks to find it.`);
      return json({
        ...taskView(task, appUrl(env)),
        subtaskList: result.data.filter((t) => t.parentId === taskId).map((t) => taskView(t, appUrl(env))),
      });
    }
  );

  server.registerTool(
    "list_task_statuses",
    {
      title: "List task statuses",
      description:
        "The board's columns in order, with each one's category (not_started, active, completed) and which is the default for new tasks. Pass projectId to get that project's own columns when it has forked them.",
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
  const { server, env, db, workspaceId, userId, scopeUserId, bridge } = d;

  server.registerTool(
    "create_task",
    {
      title: "Create a task",
      description:
        "Add a task to a project's plan — the thing to be done, separate from tracked time. Only when the person asked for this task. Use list_projects for the projectId; never guess it. `assigneeIds` must already be workspace members — ask the person who, rather than guessing.",
      inputSchema: CreateTaskSchema.shape,
      annotations: MUTATES,
    },
    async (data) => {
      const project = await findActiveProject(db, workspaceId, data.projectId);
      if (!project) {
        return refuse(`No active project with id ${data.projectId} in this workspace. Call list_projects and ask the person which project this task belongs to.`);
      }
      const result = await createTask(db, workspaceId, data, await scopeUserId(), userId);
      if ("error" in result) return refuse(result.error);
      if (data.assigneeIds?.length) {
        await notifyNewAssignees(
          env, workspaceId, result.task.id, result.task.name, userId,
          await actorDisplayName(db, userId), data.assigneeIds
        );
      }
      return json(taskView(result.task, appUrl(env)));
    }
  );

  server.registerTool(
    "move_task",
    {
      title: "Move a task to a different status",
      description:
        "Change which column/status a task is in — the same as dragging its card on the board. Use list_projects then the app (or a prior list_time_entries-style lookup) to get the taskId; never guess it. Notifies the task's assignees, except whoever's key is making this call.",
      inputSchema: { taskId: z.string(), statusId: z.string() },
      annotations: MUTATES,
    },
    async ({ taskId, statusId }) => {
      const result = await moveTaskStatus(db, workspaceId, taskId, statusId, await scopeUserId());
      if ("error" in result) return refuse(result.error);
      if (result.task.statusId !== result.previousStatusId) {
        await notifyAssigneesOfStatusChange(
          env, workspaceId, taskId, result.task.name, userId,
          await actorDisplayName(db, userId), result.task.statusName ?? "a new status"
        );
      }
      return json(taskView(result.task, appUrl(env)));
    }
  );

  server.registerTool(
    "update_task",
    {
      title: "Edit a task",
      description:
        "Change a task's name, notes, due date (a local YYYY-MM-DD day), priority (1 highest … 4 none), estimate, parent, project, repeat rule, status or assignees — only the fields passed change. To mark it done, set `active: false` and pass `completedOn` (the person's local date) so a repeating task schedules its next occurrence. `assigneeIds` replaces the whole list.",
      inputSchema: { taskId: IdArg("task"), ...UpdateTaskSchema.shape },
      annotations: { ...MUTATES, idempotentHint: true },
    },
    async ({ taskId, ...patch }) =>
      fromBridge(await bridge<Task>("PUT", `/api/tasks/${segment(taskId)}`, patch), (t) => taskView(t, appUrl(env)))
  );

  server.registerTool(
    "delete_task",
    {
      title: "Delete a task",
      description:
        "Permanently delete a task with its subtasks, comments and attachments. Only its author or a workspace owner/admin may. Tracked time logged against it stays. Confirm with the person first.",
      inputSchema: { taskId: IdArg("task") },
      annotations: DESTRUCTIVE,
    },
    async ({ taskId }) => fromBridge(await bridge("DELETE", `/api/tasks/${segment(taskId)}`))
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
      description: "Remove a comment for good. Only the comment's author can; confirm which one with the person first.",
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
