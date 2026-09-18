import { addPendingMutation } from "@/lib/idb";
import type { InferResponseType } from "hono/client";
import {
  meClient,
  timeEntriesClient,
  projectsClient,
  clientsClient,
  tagsClient,
  tasksClient,
  attachmentsClient,
  taskStatusesClient,
  favoritesClient,
  recurringClient,
  draftsClient,
  reportsClient,
  savedReportsClient,
  plannerClient,
  settingsClient,
  integrationsClient,
  calendarClient,
  aiClient,
  assistantClient,
  adminClient,
  apiKeysClient,
  notificationsClient,
  json,
} from "@/lib/http-clients";
import type {
  UpdateSettings,
  AssistantTrackEventRequest,
  CreateApiKey,
  CreateTimeEntry,
  CopyWeekEntriesRequest,
  UpdateTimeEntry,
  BulkUpdateTimeEntries,
  CreateProject,
  UpdateProject,
  CreateTask,
  UpdateTask,
  MoveTask,
  TaskAttachment,
  CreateTaskComment,
  UpdateTaskComment,
  CreateTaskStatus,
  UpdateTaskStatus,
  ArchiveTaskStatus,
  CreateClient,
  UpdateClient,
  CreateFavorite,
  CreateRecurringEntry,
  UpdateRecurringEntry,
  CreateIntegration,
  UpdateIntegration,
  AiQuickEntryRequest,
  AiSummaryRequest,
  UpsertAllocation,
  BulkUpsertAllocations,
  CreateSavedReport,
  ConfirmDrafts,
  UpdateDraft,
  GroupDimension,
  SubGroupDimension,
  CalendarProviderId,
} from "@shared/schemas";

// Re-exported so hooks/components keep importing from `@/lib/api-client`, though the shape now lives in `src/worker/routes/calendar.ts`.
export type { CalendarProviderId, CalendarProviderStatus } from "@shared/schemas";

const API_BASE = "/api";

const MUTABLE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Identifies this tab for the lifetime of the page.
 *
 * Sent as `X-Client-Id` on every request and echoed back on the WebSocket
 * broadcast the request causes, so this tab can ignore the news of its own
 * change (see `useWebSocket`). Not a security boundary — purely an echo filter,
 * and the server treats it as opaque.
 */
export const CLIENT_ID =
  globalThis.crypto?.randomUUID?.() ?? `c${Date.now().toString(36)}`;

/**
 * A failed API call, carrying enough for a caller to react precisely.
 *
 * `message` is the server's own `error` text when it sent one, so a handler can
 * show it verbatim ("Stop time must be after start time") instead of falling
 * back to a generic "Failed to update entry" that tells the user nothing about
 * what to change.
 *
 * `queued` marks the offline case: the request never reached the network but was
 * persisted for replay. It still rejects — the caller hasn't got a result — but
 * it must NOT be treated as a lost write, because the write is going to land.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly queued: boolean;
  constructor(message: string, status: number, queued = false) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.queued = queued;
  }
}

/**
 * Pull the human-readable message out of a Hono `zValidator` rejection.
 *
 * Its body is `{ success: false, error: <ZodError> }`, and both levels are
 * serialized: `error` arrives as a JSON *string*, whose `message` is itself a
 * JSON string holding the issues array. Taking `error` at face value because it
 * is a string put the entire escaped ZodError in a toast — which is what the
 * user actually saw for an inverted time range, the single most likely
 * validation failure in the app.
 *
 * Returns the first issue's message, or null when this isn't a zod rejection.
 */
function zodIssueMessage(value: unknown): string | null {
  let err: unknown = value;
  if (typeof err === "string") {
    try {
      err = JSON.parse(err);
    } catch {
      return null;
    }
  }
  if (!err || typeof err !== "object") return null;

  const { issues, message } = err as { issues?: unknown; message?: unknown };
  let list = issues;
  if (!Array.isArray(list) && typeof message === "string") {
    try {
      list = JSON.parse(message);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(list) || list.length === 0) return null;

  const first = list[0] as { message?: unknown };
  return typeof first?.message === "string" && first.message ? first.message : null;
}

/** Prefer a zod issue, then the server's `{ error }` text, then the raw body. Exported for useOfflineSync's own error toasts on a replayed write. */
export function errorMessage(raw: string, statusText: string): string {
  if (!raw) return statusText;
  try {
    const parsed = JSON.parse(raw) as { error?: unknown };
    // Before the plain-string branch: a zod rejection's `error` IS a string.
    const zod = zodIssueMessage(parsed.error);
    if (zod) return zod;
    if (typeof parsed.error === "string" && parsed.error) return parsed.error;
  } catch {
    // Not JSON — fall through to the raw text.
  }
  return raw.slice(0, 300) || statusText;
}

// Comments/statuses/attachments have side effects a blind replay must not repeat — only time-entry writes queue.
const QUEUEABLE_PATH = /^\/time_entries(\/|$)/;

/** The one place every request goes through: credentials, the client-id header, the offline queue and `ApiError` mapping. */
export async function appFetch(path: string, init?: RequestInit): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  const isFormData = init?.body instanceof FormData; // needs its own multipart boundary and can't be queued as JSON offline

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: "include",
      ...init,
      // After the spread, so a caller's `headers` can't drop the client id.
      headers: {
        ...(isFormData ? {} : { "Content-Type": "application/json" }),
        "X-Client-Id": CLIENT_ID,
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
  } catch (err) {
    // Queue mutating requests when the network is unavailable so they can be
    // replayed by useOfflineSync once connectivity is restored.
    if (
      err instanceof TypeError &&
      MUTABLE_METHODS.has(method) &&
      !isFormData &&
      QUEUEABLE_PATH.test(path)
    ) {
      const body = init?.body ? JSON.parse(init.body as string) : undefined;
      // No Idempotency-Key: nothing server-side can cheaply dedupe it yet, so sending one would be a lie.
      await addPendingMutation({
        method: method as "POST" | "PUT" | "PATCH" | "DELETE",
        url: `${API_BASE}${path}`,
        body,
      });
      throw new ApiError("Offline — saved locally, will sync when you reconnect", 0, true);
    }
    throw err;
  }
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    throw new ApiError(errorMessage(raw, res.statusText), res.status);
  }
  return res;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await appFetch(path, init);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// Report filters: comma-joined ID lists (or undefined when no selection).
export interface ReportParams {
  since: string;
  until: string;
  projectIds?: string;
  clientIds?: string;
  taskIds?: string;
  tagIds?: string;
  billable?: "billable" | "nonbillable";
  search?: string;
  roundMode?: "off" | "nearest" | "up" | "down";
  roundMinutes?: string;
  groupBy?: "day" | "week" | "month";
  // Allows passing the object straight to hc's `query` (all values stringy).
  [k: string]: string | undefined;
}

// hc's query serializer keeps an empty string (`?search=`) unlike `queryString()` below — strip both the same way.
function cleanQuery<T extends Record<string, string | undefined>>(params: T): T {
  const out = { ...params };
  for (const key of Object.keys(out) as (keyof T)[]) {
    if (out[key] === undefined || out[key] === "") delete out[key];
  }
  return out;
}

function queryString(params?: Record<string, string | undefined>): string {
  if (!params) return "";
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
  ).toString();
  return qs ? `?${qs}` : "";
}

// ─── Response types for routes whose query isn't `zValidator`-typed — request built by hand, response still inferred from the route ──
export type WorkspaceMe = InferResponseType<typeof meClient.index.$get>;
type TasksListResponse = InferResponseType<typeof tasksClient.index.$get>;
type ProjectsListResponse = InferResponseType<typeof projectsClient.index.$get>;
type ClientsListResponse = InferResponseType<typeof clientsClient.index.$get>;
type TimeEntriesListResponse = InferResponseType<typeof timeEntriesClient.index.$get>;
type CalendarEventsResponse = InferResponseType<typeof calendarClient.events.$get>;
type TaskStatusesListResponse = InferResponseType<typeof taskStatusesClient.index.$get>;
type DraftsListResponse = InferResponseType<typeof draftsClient.index.$get>;
type DraftsDiscardDayResponse = InferResponseType<typeof draftsClient.index.$delete>;

export const api = {
  me: () => json(meClient.index.$get()),
  // ─── Time entries ──────────────────────────────────────────────────────────
  timeEntries: {
    list: (params: { since?: string; until?: string }) =>
      request<TimeEntriesListResponse>(`/time_entries${queryString(params)}`),
    current: () => json(timeEntriesClient.current.$get()),
    suggestions: () => json(timeEntriesClient.suggestions.$get()),
    create: (body: CreateTimeEntry) => json(timeEntriesClient.index.$post({ json: body })),
    update: (id: string, body: UpdateTimeEntry) =>
      json(timeEntriesClient[":id"].$put({ param: { id }, json: body })),
    stop: (id: string) => json(timeEntriesClient[":id"].stop.$patch({ param: { id } })),
    delete: (id: string) => json(timeEntriesClient[":id"].$delete({ param: { id } })),
    bulkUpdate: (body: BulkUpdateTimeEntries) => json(timeEntriesClient.bulk.$patch({ json: body })),
    bulkDelete: (ids: string[]) => json(timeEntriesClient.bulk.$delete({ json: { ids } })),
    copyWeek: (body: CopyWeekEntriesRequest) =>
      json(timeEntriesClient["copy-week"].$post({ json: body })),
  },

  // ─── Projects ─────────────────────────────────────────────────────────────
  projects: {
    list: (params?: { includeArchived?: string; since?: string; until?: string }) =>
      request<ProjectsListResponse>(`/projects${queryString(params)}`),
    create: (body: CreateProject) => json(projectsClient.index.$post({ json: body })),
    update: (id: string, body: UpdateProject) =>
      json(projectsClient[":id"].$put({ param: { id }, json: body })),
    delete: (id: string) => json(projectsClient[":id"].$delete({ param: { id } })),
    pacing: () => json(projectsClient.pacing.$get()),
    recolor: () => json(projectsClient.recolor.$post()),
  },

  // ─── Tasks ────────────────────────────────────────────────────────────────
  tasks: {
    list: (params?: { projectId?: string; includeInactive?: string }) =>
      request<TasksListResponse>(`/tasks${queryString(params)}`),
    create: (body: CreateTask) => json(tasksClient.index.$post({ json: body })),
    update: (id: string, body: UpdateTask) => json(tasksClient[":id"].$put({ param: { id }, json: body })),
    /** A board drop: the column and the position inside it, in one write. */
    move: (id: string, body: MoveTask) =>
      json(tasksClient[":id"].move.$patch({ param: { id }, json: body })),
    delete: (id: string) => json(tasksClient[":id"].$delete({ param: { id } })),
    attachments: {
      list: (taskId: string) => json(tasksClient[":id"].attachments.$get({ param: { id: taskId } })),
      // Own call, not hc: a FormData body needs appFetch's raw Response, not JSON args.
      upload: async (taskId: string, file: File): Promise<TaskAttachment> => {
        const body = new FormData();
        body.append("file", file);
        const res = await appFetch(`/tasks/${taskId}/attachments`, { method: "POST", body });
        return (await res.json()) as TaskAttachment;
      },
      delete: (id: string) => json(attachmentsClient[":id"].$delete({ param: { id } })),
    },
    activity: (taskId: string) => json(tasksClient[":id"].activity.$get({ param: { id: taskId } })),
    /** Flat, single-level — no reply/thread. */
    comments: {
      list: (taskId: string) => json(tasksClient[":id"].comments.$get({ param: { id: taskId } })),
      create: (taskId: string, body: CreateTaskComment) =>
        json(tasksClient[":id"].comments.$post({ param: { id: taskId }, json: body })),
      update: (taskId: string, commentId: string, body: UpdateTaskComment) =>
        json(
          tasksClient[":id"].comments[":commentId"].$patch({
            param: { id: taskId, commentId },
            json: body,
          })
        ),
      delete: (taskId: string, commentId: string) =>
        json(
          tasksClient[":id"].comments[":commentId"].$delete({ param: { id: taskId, commentId } })
        ),
    },
  },

  // ─── Notifications (the header bell) ──────────────────────────────────────
  notifications: {
    list: () => json(notificationsClient.index.$get()),
    markRead: (id: string) => json(notificationsClient[":id"].read.$patch({ param: { id } })),
    markAllRead: () => json(notificationsClient["read-all"].$patch()),
    delete: (id: string) => json(notificationsClient[":id"].$delete({ param: { id } })),
    clearAll: () => json(notificationsClient.index.$delete()),
  },

  // ─── Task statuses (the board's columns) ──────────────────────────────────
  taskStatuses: {
    /** `projectId` omitted (or falsy) returns the workspace's global default set. */
    list: (projectId?: string | null) =>
      request<TaskStatusesListResponse>(
        `/task-statuses${projectId ? `?projectId=${projectId}` : ""}`
      ),
    create: (body: CreateTaskStatus) => json(taskStatusesClient.index.$post({ json: body })),
    update: (id: string, body: UpdateTaskStatus) =>
      json(taskStatusesClient[":id"].$put({ param: { id }, json: body })),
    /** Archive, never delete. `moveTo` is required when the status still holds tasks. */
    archive: (id: string, body: ArchiveTaskStatus) =>
      json(taskStatusesClient[":id"].archive.$post({ param: { id }, json: body })),
    /** Clones the global set into a project's own fork — idempotent. */
    // The route parses its body with a bare `c.req.json()`, so `init.body` (not hc's `json` arg) is what carries it through `appFetch`.
    fork: (projectId: string) =>
      json(
        taskStatusesClient.fork.$post({}, { init: { body: JSON.stringify({ projectId }) } })
      ),
  },

  // ─── Clients ──────────────────────────────────────────────────────────────
  clients: {
    list: (params?: { includeArchived?: string; since?: string; until?: string }) =>
      request<ClientsListResponse>(`/clients${queryString(params)}`),
    stats: (params: { since: string; until: string }) =>
      json(clientsClient.stats.$get({ query: params })),
    get: (id: string) => json(clientsClient[":id"].$get({ param: { id } })),
    create: (body: CreateClient) => json(clientsClient.index.$post({ json: body })),
    update: (id: string, body: UpdateClient) =>
      json(clientsClient[":id"].$put({ param: { id }, json: body })),
    delete: (id: string) => json(clientsClient[":id"].$delete({ param: { id } })),
  },

  // ─── Tags ─────────────────────────────────────────────────────────────────
  tags: {
    list: () => json(tagsClient.index.$get()),
    create: (name: string) => json(tagsClient.index.$post({ json: { name } })),
    update: (id: string, body: { color: string }) =>
      json(tagsClient[":id"].$patch({ param: { id }, json: body })),
  },

  // ─── Favorites ────────────────────────────────────────────────────────────
  favorites: {
    list: () => json(favoritesClient.index.$get()),
    create: (body: CreateFavorite) => json(favoritesClient.index.$post({ json: body })),
    delete: (id: string) => json(favoritesClient[":id"].$delete({ param: { id } })),
  },

  // ─── Recurring entries ────────────────────────────────────────────────────
  recurring: {
    list: () => json(recurringClient.index.$get()),
    create: (body: CreateRecurringEntry) => json(recurringClient.index.$post({ json: body })),
    update: (id: string, body: UpdateRecurringEntry) =>
      json(recurringClient[":id"].$put({ param: { id }, json: body })),
    delete: (id: string) => json(recurringClient[":id"].$delete({ param: { id } })),
  },

  // ─── Integrations ────────────────────────────────────────────────────────
  integrations: {
    list: () => json(integrationsClient.index.$get()),
    create: (body: CreateIntegration) => json(integrationsClient.index.$post({ json: body })),
    update: (id: string, body: UpdateIntegration) =>
      json(integrationsClient[":id"].$put({ param: { id }, json: body })),
    delete: (id: string) => json(integrationsClient[":id"].$delete({ param: { id } })),
    // Not `json()`: ok/failed are different literal shapes at the same 200 status, which `json<T>`'s single type param can't unify.
    test: async (id: string) => {
      const res = await integrationsClient[":id"].test.$post({ param: { id } });
      return res.json();
    },
    push: (body: { entryIds: string[]; comment?: string; timezone?: string }) =>
      json(integrationsClient.push.$post({ json: body })),
  },

  // ─── Calendar sync (Google / Microsoft) ────────────────────────────────────
  calendar: {
    // One row per calendar provider the server supports — a workspace can hold
    // a work calendar and a personal one at the same time.
    status: () => json(calendarClient.status.$get()),
    setAutoTrack: (provider: CalendarProviderId, enabled: boolean) =>
      json(calendarClient["auto-track"].$patch({ json: { enabled, provider } })),
    convert: (params: { since: string; until: string }) =>
      json(calendarClient.convert.$post({ json: params })),
    events: (params: { since: string; until: string }) =>
      request<CalendarEventsResponse>(`/calendar/events?${new URLSearchParams(params)}`),
    disconnect: (provider: CalendarProviderId) =>
      json(calendarClient[":provider"].$delete({ param: { provider } })),
  },

  // ─── AI ───────────────────────────────────────────────────────────────────
  ai: {
    quickEntry: (body: AiQuickEntryRequest) => json(aiClient["quick-entry"].$post({ json: body })),
    summary: (body: AiSummaryRequest) => json(aiClient.summary.$post({ json: body })),
  },

  // ─── Assistant ─────────────────────────────────────────────────────
  assistant: {
    nudges: (timezoneOffsetMinutes: number) =>
      json(
        assistantClient.nudges.$get({
          query: { timezoneOffsetMinutes: String(timezoneOffsetMinutes) },
        })
      ),
    // Chat moved to the ChatAgent Durable Object (streaming over WebSocket via
    // useAgentChat); there's no longer a REST chat endpoint.
    // Not `json()`: same reasoning as `integrations.test` (created true/false differ at one status).
    trackEvent: async (body: AssistantTrackEventRequest) => {
      const res = await assistantClient["track-event"].$post({ json: body });
      return res.json();
    },
    // What the assistant has remembered about the user (Settings management card).
    memory: () => json(assistantClient.memory.$get()),
    deleteMemory: (key: string) =>
      assistantClient.memory[":key"].$delete({ param: { key } }).then(() => undefined),
    clearMemory: () => assistantClient.memory.$delete().then(() => undefined),
  },

  // ─── API keys (MCP + programmatic access) ─────────────────────────────────
  apiKeys: {
    list: () => json(apiKeysClient.index.$get()),
    // The only response that ever carries the secret — it cannot be re-fetched.
    create: (body: CreateApiKey) => json(apiKeysClient.index.$post({ json: body })),
    revoke: (id: string) => json(apiKeysClient[":id"].$delete({ param: { id } })),
  },

  // ─── Admin ────────────────────────────────────────────────────────────────
  admin: {
    removeUser: (id: string) => json(adminClient.users[":id"].$delete({ param: { id } })),
  },

  // ─── Settings ─────────────────────────────────────────────────────────────
  settings: {
    get: () => json(settingsClient.index.$get()),
    update: (body: UpdateSettings) => json(settingsClient.index.$patch({ json: body })),
    sendDigest: (kind: "daily" | "weekly") =>
      json(
        settingsClient.digest.send.$post({
          // The server has no other way to know which day "yesterday" is for
          // this person, or whether it's their morning.
          json: { kind, timezoneOffsetMinutes: new Date().getTimezoneOffset() },
        })
      ),
  },

  // ─── Drafted entries ──────────────────────────────────────────────────────
  drafts: {
    list: (date: string) => request<DraftsListResponse>(`/drafts?date=${date}`),
    listRange: (since: string, until: string) =>
      request<DraftsListResponse>(`/drafts?since=${since}&until=${until}`),
    generate: (body: { date: string; timezoneOffsetMinutes: number }) =>
      json(draftsClient.generate.$post({ json: body })),
    update: (id: string, body: UpdateDraft) =>
      json(draftsClient[":id"].$patch({ param: { id }, json: body })),
    discard: (id: string) => json(draftsClient[":id"].$delete({ param: { id } })),
    discardDay: (date: string) =>
      request<DraftsDiscardDayResponse>(`/drafts?date=${date}`, { method: "DELETE" }),
    confirm: (body: ConfirmDrafts) => json(draftsClient.confirm.$post({ json: body })),
  },

  // ─── Reports ──────────────────────────────────────────────────────────────
  reports: {
    summary: (params: ReportParams & { groupBy?: "day" | "week" | "month" }) =>
      json(reportsClient.summary.$get({ query: cleanQuery(params) })),
    grouped: (params: ReportParams & { group?: GroupDimension; subGroup?: SubGroupDimension }) =>
      json(reportsClient.grouped.$get({ query: cleanQuery(params) })),
    detailed: (params: ReportParams) => json(reportsClient.detailed.$get({ query: cleanQuery(params) })),
    weekly: (params: ReportParams) => json(reportsClient.weekly.$get({ query: cleanQuery(params) })),
  },

  // ─── Planner (planned allocations) ────────────────────────────────────────
  planner: {
    list: (params: { since: string; until: string }) =>
      json(plannerClient.index.$get({ query: params })),
    // 204 (no body) when plannedSeconds clears the cell, an Allocation otherwise.
    upsert: async (body: UpsertAllocation) => {
      const res = await plannerClient.index.$put({ json: body });
      return res.status === 204 ? null : await res.json();
    },
    bulkUpsert: (body: BulkUpsertAllocations) => json(plannerClient.bulk.$post({ json: body })),
  },

  // ─── Saved reports ────────────────────────────────────────────────────────
  savedReports: {
    list: () => json(savedReportsClient.index.$get()),
    create: (body: CreateSavedReport) => json(savedReportsClient.index.$post({ json: body })),
    delete: (id: string) =>
      savedReportsClient[":id"].$delete({ param: { id } }).then(() => undefined),
  },
};
