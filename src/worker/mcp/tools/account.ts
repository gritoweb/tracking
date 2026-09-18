// The key owner's own account: role, notifications, settings, calendar status; members and keys read-only.
import { z } from "zod";
import { UpdateSettingsSchema } from "@shared/schemas";
import { listApiKeys } from "../../lib/api-keys";
import { segment } from "../rest-bridge";
import { DESTRUCTIVE, IdArg, MUTATES, READ_ONLY, fromBridge, json, type ToolDeps } from "../shared";

interface MemberListRow {
  userId: string;
  name: string | null;
  email: string;
  role: string;
  joinedAt: string;
}

export function registerAccountReads(d: ToolDeps): void {
  const { server, db, workspaceId, bridge } = d;

  server.registerTool(
    "whoami",
    {
      title: "Who am I",
      description: "The key owner's user id, workspace and role. `canManage` is true for owners/admins — the ones who may edit projects, clients, statuses and budgets.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => fromBridge(await bridge("GET", "/api/me"))
  );

  server.registerTool(
    "list_members",
    {
      title: "List workspace members",
      description: "Everyone in the workspace with their role. Use a member's userId for task assignees, @mentions and report filters. Inviting or removing people is done in the app, not here.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const { results } = await db
        .prepare(
          `SELECT m.userId AS userId, u.name AS name, u.email AS email, m.role AS role, m.createdAt AS joinedAt
           FROM "member" m JOIN "user" u ON u.id = m.userId
           WHERE m.organizationId = ? ORDER BY u.name ASC`
        )
        .bind(workspaceId)
        .all<MemberListRow>();
      return json(results);
    }
  );

  server.registerTool(
    "list_api_keys",
    {
      title: "List API keys",
      description: "The workspace's API keys — name, visible prefix, scope and last use. The secret is never shown again after creation, and keys are created or revoked only in the app.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => json(await listApiKeys(db, workspaceId))
  );

  server.registerTool(
    "list_notifications",
    {
      title: "List notifications",
      description: "The key owner's notifications (assignments, mentions, status changes), newest first, with read state.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => fromBridge(await bridge("GET", "/api/notifications"))
  );

  server.registerTool(
    "get_settings",
    {
      title: "Read my settings",
      description: "The key owner's preferences: currency, time format, rounding, week start, weekends, colour assignment and email digests.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => fromBridge(await bridge("GET", "/api/settings"))
  );

  server.registerTool(
    "get_calendar_status",
    {
      title: "Check calendar connections",
      description: "Which calendars (Google, Microsoft) are connected for the key owner and whether auto-track is on. Connecting a calendar needs the app, because it signs in through the browser.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => fromBridge(await bridge("GET", "/api/calendar/status"))
  );
}

export function registerAccountWrites(d: ToolDeps): void {
  const { server, bridge } = d;

  server.registerTool(
    "mark_notification_read",
    {
      title: "Mark a notification read",
      description: "Mark one notification as read.",
      inputSchema: { notificationId: IdArg("notification") },
      annotations: { ...MUTATES, idempotentHint: true },
    },
    async ({ notificationId }) =>
      fromBridge(await bridge("PATCH", `/api/notifications/${segment(notificationId)}/read`))
  );

  server.registerTool(
    "mark_all_notifications_read",
    {
      title: "Mark all notifications read",
      description: "Mark every notification of the key owner as read.",
      inputSchema: {},
      annotations: { ...MUTATES, idempotentHint: true },
    },
    async () => fromBridge(await bridge("PATCH", "/api/notifications/read-all"))
  );

  server.registerTool(
    "delete_notification",
    {
      title: "Dismiss a notification",
      description: "Delete one notification.",
      inputSchema: { notificationId: IdArg("notification") },
      annotations: DESTRUCTIVE,
    },
    async ({ notificationId }) =>
      fromBridge(await bridge("DELETE", `/api/notifications/${segment(notificationId)}`))
  );

  server.registerTool(
    "update_settings",
    {
      title: "Change my settings",
      description: "Change the key owner's own preferences — only the fields passed change. Never another person's.",
      inputSchema: UpdateSettingsSchema.shape,
      annotations: { ...MUTATES, idempotentHint: true },
    },
    async (body) => fromBridge(await bridge("PATCH", "/api/settings", body))
  );

  server.registerTool(
    "set_calendar_auto_track",
    {
      title: "Turn calendar auto-track on or off",
      description: "When on, meetings from the connected calendar become time entries automatically once they end.",
      inputSchema: {
        enabled: z.boolean(),
        provider: z.enum(["google", "microsoft"]).default("google"),
      },
      annotations: { ...MUTATES, idempotentHint: true },
    },
    async (body) => fromBridge(await bridge("PATCH", "/api/calendar/auto-track", body))
  );
}
