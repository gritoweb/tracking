import { addPendingMutation } from "@/lib/idb";
import type {
  Settings,
  UpdateSettings,
  AssistantMemory,
  AssistantTrackEventRequest,
  AssistantTrackEventResult,
  AssistantNudge,
  ProjectPacing,
  DraftEntry,
  UpdateDraft,
  ConfirmDrafts,
  GenerateDraftsResult,
  ApiKey,
  CreateApiKey,
  CreatedApiKey,
  TimeEntry,
  EntrySuggestion,
  CreateTimeEntry,
  UpdateTimeEntry,
  BulkUpdateTimeEntries,
  Project,
  CreateProject,
  UpdateProject,
  Task,
  CreateTask,
  UpdateTask,
  MoveTask,
  TaskAttachment,
  TaskComment,
  CreateTaskComment,
  UpdateTaskComment,
  Notification,
  TaskStatus,
  CreateTaskStatus,
  UpdateTaskStatus,
  ArchiveTaskStatus,
  Client,
  CreateClient,
  UpdateClient,
  ClientStats,
  Tag,
  Favorite,
  CreateFavorite,
  RecurringEntry,
  CreateRecurringEntry,
  UpdateRecurringEntry,
  Integration,
  CreateIntegration,
  UpdateIntegration,
  PushResult,
  AiQuickEntryRequest,
  AiQuickEntryResult,
  AiSummaryRequest,
  AiSummaryResult,
  Allocation,
  UpsertAllocation,
  BulkUpsertAllocations,
  SavedReport,
  CreateSavedReport,
  ReportSummary,
  GroupedReport,
  ReportWeekly,
  ReportDetailedEntry,
} from "@shared/schemas";

export type CalendarProviderId = "google" | "microsoft";

/** What `GET /api/calendar/status` returns for each supported provider. */
export interface CalendarProviderStatus {
  provider: CalendarProviderId;
  label: string;
  /** False when this deployment has no OAuth client configured for it. */
  configured: boolean;
  connected: boolean;
  accountEmail: string | null;
  autoTrack: boolean;
}

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
async function appFetch(path: string, init?: RequestInit): Promise<Response> {
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
  billable?: string;
  search?: string;
  roundMode?: string;
  roundMinutes?: string;
  groupBy?: string;
  // Allows passing the object straight to reportQuery() (all values stringy).
  [k: string]: string | undefined;
}

// Build a query string, dropping undefined/empty values (same pattern as the
// list endpoints) so unselected filters aren't sent as empty params.
function reportQuery(params: Record<string, string | undefined>): string {
  return new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== "") as [
      string,
      string,
    ][]
  ).toString();
}

function queryString(params?: Record<string, string | undefined>): string {
  if (!params) return "";
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined) as [string, string][]
  ).toString();
  return qs ? `?${qs}` : "";
}

export interface WorkspaceMe {
  userId: string;
  workspaceId: string;
  role: "owner" | "admin" | "member" | null;
  canManage: boolean;
}

export const api = {
  me: () => request<WorkspaceMe>("/me"),
  // ─── Time entries ──────────────────────────────────────────────────────────
  timeEntries: {
    list: (params: { since?: string; until?: string }) =>
      request<TimeEntry[]>(`/time_entries${queryString(params)}`),
    current: () => request<TimeEntry | null>("/time_entries/current"),
    suggestions: () => request<EntrySuggestion[]>("/time_entries/suggestions"),
    create: (body: CreateTimeEntry) =>
      request<TimeEntry>("/time_entries", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: UpdateTimeEntry) =>
      request<TimeEntry>(`/time_entries/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    stop: (id: string) =>
      request<TimeEntry | null>(`/time_entries/${id}/stop`, { method: "PATCH" }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/time_entries/${id}`, { method: "DELETE" }),
    bulkUpdate: (body: BulkUpdateTimeEntries) =>
      request<{ ok: boolean; updated: number }>("/time_entries/bulk", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    bulkDelete: (ids: string[]) =>
      request<{ ok: boolean; deleted: number }>("/time_entries/bulk", {
        method: "DELETE",
        body: JSON.stringify({ ids }),
      }),
  },

  // ─── Projects ─────────────────────────────────────────────────────────────
  projects: {
    list: (params?: { includeArchived?: string; since?: string; until?: string }) =>
      request<Project[]>(`/projects${queryString(params)}`),
    create: (body: CreateProject) =>
      request<Project>("/projects", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: UpdateProject) =>
      request<Project>(`/projects/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/projects/${id}`, { method: "DELETE" }),
    pacing: () => request<ProjectPacing[]>("/projects/pacing"),
    recolor: () =>
      request<{ recolored: number; usedAI: boolean }>("/projects/recolor", {
        method: "POST",
      }),
  },

  // ─── Tasks ────────────────────────────────────────────────────────────────
  tasks: {
    list: (params?: { projectId?: string; includeInactive?: string }) =>
      request<Task[]>(`/tasks${queryString(params)}`),
    create: (body: CreateTask) =>
      request<Task>("/tasks", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: UpdateTask) =>
      request<Task>(`/tasks/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    /** A board drop: the column and the position inside it, in one write. */
    move: (id: string, body: MoveTask) =>
      request<Task>(`/tasks/${id}/move`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/tasks/${id}`, { method: "DELETE" }),
    attachments: {
      list: (taskId: string) => request<TaskAttachment[]>(`/tasks/${taskId}/attachments`),
      // Own call, not request<T>(): a FormData body needs appFetch's raw Response, not its JSON assumption.
      upload: async (taskId: string, file: File): Promise<TaskAttachment> => {
        const body = new FormData();
        body.append("file", file);
        const res = await appFetch(`/tasks/${taskId}/attachments`, { method: "POST", body });
        return (await res.json()) as TaskAttachment;
      },
      delete: (id: string) => request<{ ok: boolean }>(`/attachments/${id}`, { method: "DELETE" }),
    },
    /** Flat, single-level — no reply/thread. */
    comments: {
      list: (taskId: string) => request<TaskComment[]>(`/tasks/${taskId}/comments`),
      create: (taskId: string, body: CreateTaskComment) =>
        request<TaskComment>(`/tasks/${taskId}/comments`, {
          method: "POST",
          body: JSON.stringify(body),
        }),
      update: (taskId: string, commentId: string, body: UpdateTaskComment) =>
        request<TaskComment>(`/tasks/${taskId}/comments/${commentId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        }),
      delete: (taskId: string, commentId: string) =>
        request<{ ok: boolean }>(`/tasks/${taskId}/comments/${commentId}`, { method: "DELETE" }),
    },
  },

  // ─── Notifications (the header bell) ──────────────────────────────────────
  notifications: {
    list: () =>
      request<{ notifications: Notification[]; unreadCount: number }>("/notifications"),
    markRead: (id: string) =>
      request<{ ok: boolean }>(`/notifications/${id}/read`, { method: "PATCH" }),
    markAllRead: () => request<{ ok: boolean }>("/notifications/read-all", { method: "PATCH" }),
    delete: (id: string) => request<{ ok: boolean }>(`/notifications/${id}`, { method: "DELETE" }),
    clearAll: () => request<{ ok: boolean }>("/notifications", { method: "DELETE" }),
  },

  // ─── Task statuses (the board's columns) ──────────────────────────────────
  taskStatuses: {
    /** `projectId` omitted (or falsy) returns the workspace's global default set. */
    list: (projectId?: string | null) =>
      request<TaskStatus[]>(`/task-statuses${projectId ? `?projectId=${projectId}` : ""}`),
    create: (body: CreateTaskStatus) =>
      request<TaskStatus>("/task-statuses", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: UpdateTaskStatus) =>
      request<TaskStatus>(`/task-statuses/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    /** Archive, never delete. `moveTo` is required when the status still holds tasks. */
    archive: (id: string, body: ArchiveTaskStatus) =>
      request<{ ok: boolean; moved: number }>(`/task-statuses/${id}/archive`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    /** Clones the global set into a project's own fork — idempotent. */
    fork: (projectId: string) =>
      request<TaskStatus[]>("/task-statuses/fork", {
        method: "POST",
        body: JSON.stringify({ projectId }),
      }),
  },

  // ─── Clients ──────────────────────────────────────────────────────────────
  clients: {
    list: (params?: { includeArchived?: string; since?: string; until?: string }) =>
      request<Client[]>(`/clients${queryString(params)}`),
    stats: (params: { since: string; until: string }) =>
      request<ClientStats[]>(`/clients/stats?${new URLSearchParams(params).toString()}`),
    get: (id: string) => request<Client>(`/clients/${id}`),
    create: (body: CreateClient) =>
      request<Client>("/clients", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: UpdateClient) =>
      request<Client>(`/clients/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/clients/${id}`, { method: "DELETE" }),
  },

  // ─── Tags ─────────────────────────────────────────────────────────────────
  tags: {
    list: () => request<Tag[]>("/tags"),
    create: (name: string) =>
      request<Tag>("/tags", {
        method: "POST",
        body: JSON.stringify({ name }),
      }),
    update: (id: string, body: { color: string }) =>
      request<{ ok: boolean }>(`/tags/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },

  // ─── Favorites ────────────────────────────────────────────────────────────
  favorites: {
    list: () => request<Favorite[]>("/favorites"),
    create: (body: CreateFavorite) =>
      request<Favorite>("/favorites", { method: "POST", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/favorites/${id}`, { method: "DELETE" }),
  },

  // ─── Recurring entries ────────────────────────────────────────────────────
  recurring: {
    list: () => request<RecurringEntry[]>("/recurring"),
    create: (body: CreateRecurringEntry) =>
      request<RecurringEntry>("/recurring", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: UpdateRecurringEntry) =>
      request<RecurringEntry>(`/recurring/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/recurring/${id}`, { method: "DELETE" }),
  },

  // ─── Integrations ────────────────────────────────────────────────────────
  integrations: {
    list: () => request<Integration[]>("/integrations"),
    create: (body: CreateIntegration) =>
      request<Integration>("/integrations", { method: "POST", body: JSON.stringify(body) }),
    update: (id: string, body: UpdateIntegration) =>
      request<Integration>(`/integrations/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/integrations/${id}`, { method: "DELETE" }),
    test: (id: string) =>
      request<{ ok: boolean; error?: string }>(`/integrations/${id}/test`, { method: "POST" }),
    push: (body: { entryIds: string[]; comment?: string; timezone?: string }) =>
      request<{ results: PushResult[] }>("/integrations/push", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },

  // ─── Calendar sync (Google / Microsoft) ────────────────────────────────────
  calendar: {
    // One row per calendar provider the server supports — a workspace can hold
    // a work calendar and a personal one at the same time.
    status: () => request<CalendarProviderStatus[]>("/calendar/status"),
    setAutoTrack: (provider: CalendarProviderId, enabled: boolean) =>
      request<{ ok: boolean; autoTrack: boolean }>("/calendar/auto-track", {
        method: "PATCH",
        body: JSON.stringify({ enabled, provider }),
      }),
    convert: (params: { since: string; until: string }) =>
      request<{ created: number }>("/calendar/convert", {
        method: "POST",
        body: JSON.stringify(params),
      }),
    events: (params: { since: string; until: string }) => {
      const qs = new URLSearchParams();
      qs.set("since", params.since);
      qs.set("until", params.until);
      return request<
        { calendarEventId: string; title: string; start: string; stop: string }[]
      >(`/calendar/events?${qs}`);
    },
    disconnect: (provider: CalendarProviderId) =>
      request<{ ok: boolean }>(`/calendar/${provider}`, { method: "DELETE" }),
  },

  // ─── AI ───────────────────────────────────────────────────────────────────
  ai: {
    quickEntry: (body: AiQuickEntryRequest) =>
      request<AiQuickEntryResult>("/ai/quick-entry", { method: "POST", body: JSON.stringify(body) }),
    summary: (body: AiSummaryRequest) =>
      request<AiSummaryResult>("/ai/summary", { method: "POST", body: JSON.stringify(body) }),
  },

  // ─── Assistant ─────────────────────────────────────────────────────
  assistant: {
    nudges: (timezoneOffsetMinutes: number) =>
      request<AssistantNudge[]>(
        `/assistant/nudges?timezoneOffsetMinutes=${timezoneOffsetMinutes}`
      ),
    // Chat moved to the ChatAgent Durable Object (streaming over WebSocket via
    // useAgentChat); there's no longer a REST chat endpoint.
    trackEvent: (body: AssistantTrackEventRequest) =>
      request<AssistantTrackEventResult>("/assistant/track-event", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    // What the assistant has remembered about the user (Settings management card).
    memory: () => request<AssistantMemory[]>("/assistant/memory"),
    deleteMemory: (key: string) =>
      request<void>(`/assistant/memory/${encodeURIComponent(key)}`, { method: "DELETE" }),
    clearMemory: () => request<void>("/assistant/memory", { method: "DELETE" }),
  },

  // ─── API keys (MCP + programmatic access) ─────────────────────────────────
  apiKeys: {
    list: () => request<ApiKey[]>("/keys"),
    // The only response that ever carries the secret — it cannot be re-fetched.
    create: (body: CreateApiKey) =>
      request<CreatedApiKey>("/keys", { method: "POST", body: JSON.stringify(body) }),
    revoke: (id: string) => request<{ ok: boolean }>(`/keys/${id}`, { method: "DELETE" }),
  },

  // ─── Admin ────────────────────────────────────────────────────────────────
  admin: {
    removeUser: (id: string) =>
      request<{ ok: boolean; purgedWorkspaces: number }>(
        `/admin/users/${encodeURIComponent(id)}`,
        { method: "DELETE" }
      ),
  },

  // ─── Settings ─────────────────────────────────────────────────────────────
  settings: {
    get: () => request<Settings>("/settings"),
    update: (body: UpdateSettings) =>
      request<Settings>("/settings", {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    sendDigest: (kind: "daily" | "weekly") =>
      request<{ sent: boolean; subject: string }>("/settings/digest/send", {
        method: "POST",
        // The server has no other way to know which day "yesterday" is for
        // this person, or whether it's their morning.
        body: JSON.stringify({
          kind,
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
        }),
      }),
  },

  // ─── Drafted entries ──────────────────────────────────────────────────────
  drafts: {
    list: (date: string) => request<DraftEntry[]>(`/drafts?date=${date}`),
    listRange: (since: string, until: string) =>
      request<DraftEntry[]>(`/drafts?since=${since}&until=${until}`),
    generate: (body: { date: string; timezoneOffsetMinutes: number }) =>
      request<GenerateDraftsResult>("/drafts/generate", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    update: (id: string, body: UpdateDraft) =>
      request<DraftEntry>(`/drafts/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    discard: (id: string) => request<{ ok: boolean }>(`/drafts/${id}`, { method: "DELETE" }),
    discardDay: (date: string) =>
      request<{ deleted: number }>(`/drafts?date=${date}`, { method: "DELETE" }),
    confirm: (body: ConfirmDrafts) =>
      request<{ confirmed: number; totalSeconds: number }>("/drafts/confirm", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },

  // ─── Reports ──────────────────────────────────────────────────────────────
  reports: {
    summary: (params: ReportParams & { groupBy?: string }) =>
      request<ReportSummary>(`/reports/summary?${reportQuery(params)}`),
    grouped: (params: ReportParams & { group?: string; subGroup?: string }) =>
      request<GroupedReport>(`/reports/grouped?${reportQuery(params)}`),
    detailed: (params: ReportParams) =>
      request<ReportDetailedEntry[]>(`/reports/detailed?${reportQuery(params)}`),
    weekly: (params: ReportParams) =>
      request<ReportWeekly[]>(`/reports/weekly?${reportQuery(params)}`),
  },

  // ─── Planner (planned allocations) ────────────────────────────────────────
  planner: {
    list: (params: { since: string; until: string }) =>
      request<Allocation[]>(`/planner?since=${params.since}&until=${params.until}`),
    // 204 (no body) when plannedSeconds clears the cell, an Allocation otherwise.
    upsert: (body: UpsertAllocation) =>
      request<Allocation | null>("/planner", { method: "PUT", body: JSON.stringify(body) }),
    bulkUpsert: (body: BulkUpsertAllocations) =>
      request<{ upserted: number; deleted: number }>("/planner/bulk", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },

  // ─── Saved reports ────────────────────────────────────────────────────────
  savedReports: {
    list: () => request<SavedReport[]>("/saved-reports"),
    create: (body: CreateSavedReport) =>
      request<SavedReport>("/saved-reports", { method: "POST", body: JSON.stringify(body) }),
    delete: (id: string) =>
      request<{ ok: boolean }>(`/saved-reports/${id}`, { method: "DELETE" }),
  },
};
