import { hc, type PickResponseByStatusCode } from "hono/client";
import { appFetch } from "./api-client";

// Importing a router's *type* pulls its whole file graph into this project's tsc program — that coupling is the point.
import type { meRouter } from "../../worker/routes/me";
import type { timeEntriesRouter } from "../../worker/routes/time-entries";
import type { projectsRouter } from "../../worker/routes/projects";
import type { clientsRouter } from "../../worker/routes/clients";
import type { tagsRouter } from "../../worker/routes/tags";
import type { tasksRouter } from "../../worker/routes/tasks";
import type { attachmentsRouter } from "../../worker/routes/attachments";
import type { taskStatusesRouter } from "../../worker/routes/task-statuses";
import type { favoritesRouter } from "../../worker/routes/favorites";
import type { recurringRouter } from "../../worker/routes/recurring";
import type { draftsRouter } from "../../worker/routes/drafts";
import type { reportsRouter } from "../../worker/routes/reports";
import type { savedReportsRouter } from "../../worker/routes/saved-reports";
import type { plannerRouter } from "../../worker/routes/planner";
import type { settingsRouter } from "../../worker/routes/settings";
import type { integrationsRouter } from "../../worker/routes/integrations";
import type { calendarRouter } from "../../worker/routes/calendar";
import type { slackRouter } from "../../worker/routes/slack";
import type { aiRouter } from "../../worker/routes/ai";
import type { assistantRouter } from "../../worker/routes/assistant";
import type { adminRouter } from "../../worker/routes/admin";
import type { apiKeysRouter } from "../../worker/routes/api-keys";
import type { notificationsRouter } from "../../worker/routes/notifications";

// hc calls its fetch option as `(url, init)`, same shape as `appFetch` — a type adapter, not a new code path.
const honoFetch: typeof fetch = (input, init) => appFetch(String(input), init);

// Base path = the router's own mount minus `/api` (appFetch re-adds it); `PickResponseByStatusCode` drops the error-status branches `appFetch` already turned into a throw.
export const meClient = hc<PickResponseByStatusCode<typeof meRouter, 200>>("/me", {
  fetch: honoFetch,
});
export const timeEntriesClient = hc<PickResponseByStatusCode<typeof timeEntriesRouter, 200 | 201>>(
  "/time_entries",
  { fetch: honoFetch }
);
export const projectsClient = hc<PickResponseByStatusCode<typeof projectsRouter, 200 | 201>>(
  "/projects",
  { fetch: honoFetch }
);
export const clientsClient = hc<PickResponseByStatusCode<typeof clientsRouter, 200 | 201>>(
  "/clients",
  { fetch: honoFetch }
);
export const tagsClient = hc<PickResponseByStatusCode<typeof tagsRouter, 200 | 201>>("/tags", {
  fetch: honoFetch,
});
export const tasksClient = hc<PickResponseByStatusCode<typeof tasksRouter, 200 | 201>>("/tasks", {
  fetch: honoFetch,
});
export const attachmentsClient = hc<PickResponseByStatusCode<typeof attachmentsRouter, 200>>(
  "/attachments",
  { fetch: honoFetch }
);
export const taskStatusesClient = hc<
  PickResponseByStatusCode<typeof taskStatusesRouter, 200 | 201>
>("/task-statuses", { fetch: honoFetch });
export const favoritesClient = hc<PickResponseByStatusCode<typeof favoritesRouter, 200 | 201>>(
  "/favorites",
  { fetch: honoFetch }
);
export const recurringClient = hc<PickResponseByStatusCode<typeof recurringRouter, 200 | 201>>(
  "/recurring",
  { fetch: honoFetch }
);
export const draftsClient = hc<PickResponseByStatusCode<typeof draftsRouter, 200>>("/drafts", {
  fetch: honoFetch,
});
export const reportsClient = hc<PickResponseByStatusCode<typeof reportsRouter, 200>>("/reports", {
  fetch: honoFetch,
});
export const savedReportsClient = hc<
  PickResponseByStatusCode<typeof savedReportsRouter, 200 | 201 | 204>
>("/saved-reports", { fetch: honoFetch });
export const plannerClient = hc<PickResponseByStatusCode<typeof plannerRouter, 200 | 204>>(
  "/planner",
  { fetch: honoFetch }
);
export const settingsClient = hc<PickResponseByStatusCode<typeof settingsRouter, 200>>("/settings", {
  fetch: honoFetch,
});
export const integrationsClient = hc<
  PickResponseByStatusCode<typeof integrationsRouter, 200 | 201>
>("/integrations", { fetch: honoFetch });
export const calendarClient = hc<PickResponseByStatusCode<typeof calendarRouter, 200>>("/calendar", {
  fetch: honoFetch,
});
export const slackClient = hc<PickResponseByStatusCode<typeof slackRouter, 200>>("/slack", {
  fetch: honoFetch,
});
export const aiClient = hc<PickResponseByStatusCode<typeof aiRouter, 200>>("/ai", {
  fetch: honoFetch,
});
export const assistantClient = hc<PickResponseByStatusCode<typeof assistantRouter, 200 | 204>>(
  "/assistant",
  { fetch: honoFetch }
);
export const adminClient = hc<PickResponseByStatusCode<typeof adminRouter, 200>>("/admin", {
  fetch: honoFetch,
});
export const apiKeysClient = hc<PickResponseByStatusCode<typeof apiKeysRouter, 200 | 201>>("/keys", {
  fetch: honoFetch,
});
export const notificationsClient = hc<PickResponseByStatusCode<typeof notificationsRouter, 200>>(
  "/notifications",
  { fetch: honoFetch }
);

/** Sugar for the common case: no 204 branch, so `.json()` always resolves. */
export function json<T>(promise: Promise<{ json(): Promise<T> }>): Promise<T> {
  return promise.then((res) => res.json());
}
