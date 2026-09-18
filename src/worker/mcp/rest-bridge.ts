// Runs an MCP tool through the same Hono routers the app's screens call, so a
// tool inherits their validation, role checks and broadcasts instead of
// re-implementing them. The workspace and person come from the resolved API
// key; nothing a model sends can change them.
//
// Only the routers a tool needs are mounted. API-key management, admin, AI,
// assistant and websocket routes are deliberately absent: a key must never
// reach them, whatever path a bug might build.

import { Hono } from "hono";
import { timeEntriesRouter } from "../routes/time-entries";
import { projectsRouter } from "../routes/projects";
import { clientsRouter } from "../routes/clients";
import { tagsRouter } from "../routes/tags";
import { tasksRouter } from "../routes/tasks";
import { attachmentsRouter } from "../routes/attachments";
import { taskStatusesRouter } from "../routes/task-statuses";
import { favoritesRouter } from "../routes/favorites";
import { recurringRouter } from "../routes/recurring";
import { reportsRouter } from "../routes/reports";
import { savedReportsRouter } from "../routes/saved-reports";
import { plannerRouter } from "../routes/planner";
import { settingsRouter } from "../routes/settings";
import { calendarRouter } from "../routes/calendar";
import { meRouter } from "../routes/me";
import { notificationsRouter } from "../routes/notifications";

export type BridgeMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type BridgeResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

export type RestBridge = <T = unknown>(
  method: BridgeMethod,
  path: string,
  body?: unknown
) => Promise<BridgeResult<T>>;

/** Every mounted prefix — the test pins this list so a sensitive router can't slip in unnoticed. */
export const BRIDGED_PREFIXES = [
  "/api/time_entries",
  "/api/projects",
  "/api/clients",
  "/api/tags",
  "/api/tasks",
  "/api/attachments",
  "/api/task-statuses",
  "/api/favorites",
  "/api/recurring",
  "/api/reports",
  "/api/saved-reports",
  "/api/planner",
  "/api/settings",
  "/api/calendar",
  "/api/me",
  "/api/notifications",
] as const;

function buildBridgeApp(workspaceId: string, userId: string) {
  return new Hono<{ Bindings: Env; Variables: { workspaceId: string; userId: string } }>()
    .use("*", async (c, next) => {
      c.set("workspaceId", workspaceId);
      c.set("userId", userId);
      await next();
    })
    .route("/api/time_entries", timeEntriesRouter)
    .route("/api/projects", projectsRouter)
    .route("/api/clients", clientsRouter)
    .route("/api/tags", tagsRouter)
    .route("/api/tasks", tasksRouter)
    .route("/api/attachments", attachmentsRouter)
    .route("/api/task-statuses", taskStatusesRouter)
    .route("/api/favorites", favoritesRouter)
    .route("/api/recurring", recurringRouter)
    .route("/api/reports", reportsRouter)
    .route("/api/saved-reports", savedReportsRouter)
    .route("/api/planner", plannerRouter)
    .route("/api/settings", settingsRouter)
    .route("/api/calendar", calendarRouter)
    .route("/api/me", meRouter)
    .route("/api/notifications", notificationsRouter);
}

/** Turns a route's error body (plain `error` string or a zod issue list) into one readable sentence. */
export function errorMessage(status: number, payload: unknown): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const error = (payload as { error: unknown }).error;
    if (typeof error === "string") return error;
    if (error && typeof error === "object") {
      const issues = (error as { issues?: unknown }).issues;
      if (Array.isArray(issues) && issues.length) {
        return issues
          .map((i: { path?: unknown[]; message?: string }) =>
            i.path?.length ? `${i.path.join(".")}: ${i.message}` : String(i.message)
          )
          .join("; ");
      }
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string") return message;
    }
  }
  if (status === 403) return "Not allowed for your role in this workspace.";
  if (status === 404) return "Not found in this workspace.";
  return `Request failed with status ${status}.`;
}

function parseBody(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return { error: raw.slice(0, 500) };
  }
}

/** Ids from a model are path segments; encoding keeps one from walking to another route. */
export function segment(id: string): string {
  return encodeURIComponent(id);
}

export function createRestBridge(
  env: Env,
  executionCtx: ExecutionContext,
  workspaceId: string,
  userId: string
): RestBridge {
  const app = buildBridgeApp(workspaceId, userId);
  return async <T>(method: BridgeMethod, path: string, body?: unknown): Promise<BridgeResult<T>> => {
    const init: RequestInit = { method };
    if (body instanceof FormData) {
      init.body = body;
    } else if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers = { "Content-Type": "application/json" };
    }
    const res = await app.request(path, init, env, executionCtx);
    const payload = parseBody(await res.text());
    if (!res.ok) return { ok: false, status: res.status, error: errorMessage(res.status, payload) };
    return { ok: true, status: res.status, data: payload as T };
  };
}
