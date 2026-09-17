// Turning calendar events into tracked time entries — used both by the
// user-triggered "Convert all" endpoint and the cron-driven auto-track
// scheduler. Provider-agnostic: it asks lib/calendar-connections.ts for the
// person's events and never knows which calendar they came from.

import { broadcast } from "../db/queries";
import { inferEventProjects, type InferredEventProject } from "./ai";
import {
  fetchUserEvents,
  connectionsWithAutoTrack,
} from "./calendar-connections";
import type { ExternalEvent } from "./calendar-providers";
import { resolveEntryBillable } from "@shared/billable";

/** Insert this person's entries for events they haven't confirmed in [since, until]. Returns count. */
async function insertEvents(
  env: Env,
  workspaceId: string,
  userId: string,
  since: string,
  until: string,
  events: ExternalEvent[]
): Promise<number> {
  const db = env.DB;
  if (!events.length) return 0;

  // Per person: two attendees of the same meeting each track their own copy.
  const { results } = await db
    .prepare(
      `SELECT calendar_event_id FROM time_entries
       WHERE workspace_id = ? AND user_id = ? AND calendar_event_id IS NOT NULL
         AND start >= ? AND start <= ?`
    )
    .bind(workspaceId, userId, since, until)
    .all<{ calendar_event_id: string }>();
  const confirmed = new Set(results.map((r) => r.calendar_event_id));

  const fresh = events.filter((e) => !confirmed.has(e.calendarEventId));
  if (!fresh.length) return 0;

  // Project match from the event title, so meetings land on the right engagement.
  let inferred = new Map<string, InferredEventProject>();
  try {
    inferred = await inferEventProjects(db, env.AI, workspaceId, fresh.map((e) => e.title));
  } catch (e) {
    console.warn("autotrack: project inference unavailable", { workspaceId, error: String(e) });
  }

  // Every entry needs a project (D3): a meeting the inference can't place stays a ghost block for the person to track.
  const placeable = fresh.flatMap((e) => {
    const match = inferred.get(e.title.trim());
    return match?.projectId ? [{ event: e, match }] : [];
  });
  if (!placeable.length) return 0;

  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT INTO time_entries
       (id, workspace_id, user_id, project_id, task_id, description, start, stop, duration, billable, calendar_event_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, CAST((julianday(?) - julianday(?)) * 86400 + 0.5 AS INTEGER), ?, ?, ?, ?)`
  );
  await db.batch(
    placeable.map(({ event: e, match }) =>
      stmt.bind(
        crypto.randomUUID(),
        workspaceId,
        userId,
        match.projectId,
        e.title,
        e.start,
        e.stop,
        e.stop,
        e.start,
        resolveEntryBillable(match.billable) ? 1 : 0,
        e.calendarEventId,
        now,
        now
      )
    )
  );
  return placeable.length;
}

/**
 * Materialize one person's calendar events in [since, until] into their time
 * entries. `onlyEnded` restricts to events that have already finished (used by
 * the scheduler so we don't create entries with a stop time in the future).
 * `onlyAutoTrack` restricts to calendars the user opted into auto-tracking —
 * the cron's business, not the "Convert all" button's.
 */
export async function convertRange(
  env: Env,
  workspaceId: string,
  userId: string,
  since: string,
  until: string,
  opts: { onlyEnded?: boolean; onlyAutoTrack?: boolean } = {}
): Promise<number> {
  let events = await fetchUserEvents(env, workspaceId, userId, since, until, {
    onlyAutoTrack: opts.onlyAutoTrack,
  });
  if (opts.onlyEnded) {
    const nowMs = Date.now();
    events = events.filter((e) => new Date(e.stop).getTime() <= nowMs);
  }

  const created = await insertEvents(env, workspaceId, userId, since, until, events);
  if (created > 0) {
    await broadcast(env, workspaceId, "entries:changed", { source: "calendar" }, null, userId);
  }
  return created;
}

/**
 * Cron entry point: for every person with an auto-track calendar, materialize
 * events that finished in the last hour. Dedup keeps it idempotent, so
 * overlapping runs are safe.
 */
export async function runAutoTrack(env: Env): Promise<void> {
  const connections = await connectionsWithAutoTrack(env);
  if (!connections.length) return;

  const now = Date.now();
  const since = new Date(now - 60 * 60 * 1000).toISOString();
  const until = new Date(now + 60 * 1000).toISOString();

  // Bounded concurrency: a serial sweep head-of-line-blocks every person
  // behind one slow provider response; unbounded Promise.all would breach the
  // 6-simultaneous-connection limit. Chunks of 5 keep the sweep O(n/5).
  const CONCURRENCY = 5;
  for (let i = 0; i < connections.length; i += CONCURRENCY) {
    await Promise.all(
      connections.slice(i, i + CONCURRENCY).map(async ({ workspaceId, userId }) => {
        try {
          await convertRange(env, workspaceId, userId, since, until, {
            onlyEnded: true,
            onlyAutoTrack: true,
          });
        } catch (e) {
          // One person failing (revoked token, transient provider error) must
          // not abort the rest of the sweep — but a persistent failure means
          // their entries silently stop materializing, so log it.
          console.error("autotrack: sweep failed", {
            workspaceId,
            userId,
            error: String(e),
          });
        }
      })
    );
  }
}
