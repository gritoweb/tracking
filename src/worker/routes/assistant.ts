import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import {
  AssistantTrackEventRequestSchema,
  type AssistantTrackEventResult,
} from "@shared/schemas";
import { computeNudges } from "../lib/assistant";
import { inferEventProjects } from "../lib/ai";
import { listMemories, deleteMemory, clearMemories } from "../lib/assistant-memory";
import { findActiveProject } from "../lib/projects";
import { broadcast } from "../db/queries";

// Clamp to sane UTC offsets so a bad client can't shift day-bound queries
// arbitrarily far. Same JS getTimezoneOffset() convention as the AI routes.
const NudgesQuerySchema = z.object({
  timezoneOffsetMinutes: z.coerce.number().min(-14 * 60).max(14 * 60).default(0),
});

export const assistantRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  // Deterministic, cheap to poll — no AI involved.
  .get("/nudges", zValidator("query", NudgesQuerySchema), async (c) => {
    const { timezoneOffsetMinutes } = c.req.valid("query");
    const nudges = await computeNudges(c.env, c.get("workspaceId"), c.get("userId"), timezoneOffsetMinutes);
    return c.json(nudges);
  })
  // One-click "Add to timesheet" from an untracked-meeting nudge. Server-side
  // so the entry can be pre-categorized via grounded AI project inference.
  // Every entry needs a project (D3): a meeting it can't place is refused and stays a ghost block.
  .post("/track-event", zValidator("json", AssistantTrackEventRequestSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const { calendarEventId, title, start, stop, projectId } = c.req.valid("json");

    // Idempotent per person: the nudge may race auto-track or a double-click, and each attendee tracks their own copy.
    const existing = await c.env.DB.prepare(
      `SELECT id FROM time_entries WHERE workspace_id = ? AND user_id = ? AND calendar_event_id = ? LIMIT 1`
    )
      .bind(workspaceId, userId, calendarEventId)
      .first<{ id: string }>();
    if (existing) {
      return c.json({
        created: false,
        projectId: null,
        projectName: null,
        billable: false,
      } satisfies AssistantTrackEventResult);
    }

    let project: { id: string; name: string; billable: boolean } | null = null;
    if (projectId) {
      project = await findActiveProject(c.env.DB, workspaceId, projectId);
    } else {
      try {
        const match = (await inferEventProjects(c.env.DB, c.env.AI, workspaceId, [title])).get(title.trim());
        if (match?.projectId) {
          project = { id: match.projectId, name: match.projectName, billable: match.billable };
        }
      } catch {
        // Best-effort only.
      }
    }
    if (!project) {
      return c.json(
        { error: "No project matches this meeting. Track it from the calendar and pick one." },
        422
      );
    }

    const now = new Date().toISOString();
    const duration = Math.round(
      (new Date(stop).getTime() - new Date(start).getTime()) / 1000
    );
    await c.env.DB.prepare(
      `INSERT INTO time_entries
         (id, workspace_id, user_id, project_id, task_id, description, start, stop, duration, billable, calendar_event_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        crypto.randomUUID(),
        workspaceId,
        userId,
        project.id,
        title,
        start,
        stop,
        duration,
        project.billable ? 1 : 0,
        calendarEventId,
        now,
        now
      )
      .run();
    c.executionCtx.waitUntil(
      broadcast(c.env, workspaceId, "entries:changed", { source: "assistant" }, null, userId)
    );

    return c.json({
      created: true,
      projectId: project.id,
      projectName: project.name,
      billable: project.billable,
    } satisfies AssistantTrackEventResult);
  })
  // ─── Memory management (what the assistant has remembered about the user) ─────────────
  .get("/memory", async (c) => {
    const memories = await listMemories(c.env.DB, c.get("workspaceId"), c.get("userId"));
    return c.json(memories);
  })
  .delete("/memory", async (c) => {
    await clearMemories(c.env.DB, c.get("workspaceId"), c.get("userId"));
    return c.body(null, 204);
  })
  .delete("/memory/:key", async (c) => {
    const deleted = await deleteMemory(
      c.env.DB,
      c.get("workspaceId"),
      c.get("userId"),
      c.req.param("key")
    );
    return deleted ? c.body(null, 204) : c.json({ error: "Not found" }, 404);
  });
