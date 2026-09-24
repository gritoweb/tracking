// Time entries, the running timer (read-only), reports and drafts.
import { z } from "zod";
import { buildReportWhere, durationExpr, formatEntry, ENTRY_SELECT } from "../../db/queries";
import type { TimeEntryJoinRow } from "../../db/rows";
import { generateDrafts, listDrafts } from "../../lib/drafts";
import { BULK_ENTRY_IDS_MAX, BulkUpdateTimeEntriesSchema, UpdateTimeEntrySchema } from "@shared/schemas";
import { segment, type BridgeResult } from "../rest-bridge";
import { batchInput, rejected, runBatch } from "../batch";
import { entryUrl } from "../links";
import { appUrl } from "../../lib/app-url";
import type { TimeEntry } from "@shared/schemas";
import {
  DESTRUCTIVE, DateArg, IdArg, MUTATES, READ_ONLY, ROW_LIMIT, TimezoneArg,
  fromBridge, hours, json, rangeToIso, type ToolDeps,
} from "../shared";

/** `get_time_summary`'s own aggregation, shared by the totals row and each breakdown row. */
interface McpSummaryRow {
  name?: string;
  entries: number;
  total: number | null;
  billable: number | null;
  amount: number | null;
}

/** `get_running_timer`'s own projection. */
interface McpRunningTimerRow {
  id: string;
  description: string;
  start: string;
  project_name: string | null;
}

/** An entry as the API returns it, plus where the app shows it. */
function withEntryUrl(entry: TimeEntry, base: string) {
  return { ...entry, url: entryUrl(base, entry.start, entry.id) };
}

export function registerEntryReads(d: ToolDeps): void {
  const { server, ctx, env, db, workspaceId, userId, scopeUserId, bridge } = d;

  server.registerTool(
    "get_time_summary",
    {
      title: "Summarize tracked time",
      description:
        "Total, billable and invoiceable time over a date range, broken down by project, client, task or tag. This is the tool for 'how much did I bill client X last quarter' and 'which project took the most time'. Amounts use each project's own hourly rate.",
      inputSchema: {
        since: DateArg.describe("First day of the range (inclusive), YYYY-MM-DD"),
        until: DateArg.describe("Last day of the range (inclusive), YYYY-MM-DD"),
        groupBy: z
          .enum(["project", "client", "task", "tag"])
          .default("project")
          .describe("Which dimension to break the total down by"),
        timezoneOffsetMinutes: TimezoneArg,
      },
      annotations: READ_ONLY,
    },
    async ({ since, until, groupBy, timezoneOffsetMinutes }) => {
      const { sinceIso, untilIso } = rangeToIso(since, until, timezoneOffsetMinutes);
      const { where, bindings } = buildReportWhere({
        workspaceId,
        since: sinceIso,
        until: untilIso,
        scopeUserId: await scopeUserId(),
      });
      const dur = durationExpr();
      const amount = `SUM((CASE WHEN te.billable = 1 THEN ${dur} ELSE 0 END) * COALESCE(p.rate, 0) / 3600.0)`;

      // Tag grouping needs the join table; the other three hang off the entry or
      // its project. Kept as one shape so the response is uniform whichever
      // dimension was asked for.
      const dimension = {
        project: { col: "te.project_id", name: "COALESCE(p.name, 'No project')", join: "" },
        client: {
          col: "p.client_id",
          name: "COALESCE(cl.name, 'No client')",
          join: `LEFT JOIN clients cl ON cl.id = p.client_id AND cl.workspace_id = te.workspace_id`,
        },
        task: {
          col: "te.task_id",
          name: "COALESCE(tk.name, 'No task')",
          join: `LEFT JOIN tasks tk ON tk.id = te.task_id AND tk.workspace_id = te.workspace_id`,
        },
        tag: {
          col: "t.id",
          name: "COALESCE(t.name, 'No tag')",
          join: `LEFT JOIN time_entry_tags tet ON tet.time_entry_id = te.id
                 LEFT JOIN tags t ON t.id = tet.tag_id AND t.workspace_id = te.workspace_id`,
        },
      }[groupBy];

      const [totals, grouped] = await db.batch<McpSummaryRow>([
        db
          .prepare(
            `SELECT COUNT(*) AS entries, SUM(${dur}) AS total,
                    SUM(CASE WHEN te.billable = 1 THEN ${dur} ELSE 0 END) AS billable,
                    ${amount} AS amount
             FROM time_entries te
             LEFT JOIN projects p ON p.id = te.project_id
             WHERE ${where}`
          )
          .bind(...bindings),
        db
          .prepare(
            `SELECT ${dimension.name} AS name, COUNT(*) AS entries,
                    SUM(${dur}) AS total,
                    SUM(CASE WHEN te.billable = 1 THEN ${dur} ELSE 0 END) AS billable,
                    ${amount} AS amount
             FROM time_entries te
             LEFT JOIN projects p ON p.id = te.project_id
             ${dimension.join}
             WHERE ${where}
             GROUP BY ${dimension.col}
             ORDER BY total DESC`
          )
          .bind(...bindings),
      ]);

      const row = totals.results[0];
      return json({
        range: { since, until },
        groupBy,
        totalHours: hours(row?.total ?? 0),
        billableHours: hours(row?.billable ?? 0),
        billableAmount: Math.round((row?.amount ?? 0) * 100) / 100,
        entryCount: row?.entries ?? 0,
        breakdown: grouped.results.map((r) => ({
          name: r.name,
          hours: hours(r.total ?? 0),
          billableHours: hours(r.billable ?? 0),
          amount: Math.round((r.amount ?? 0) * 100) / 100,
          entries: r.entries,
        })),
      });
    }
  );

  server.registerTool(
    "list_time_entries",
    {
      title: "List time entries",
      description:
        "Individual time entries in a date range, newest first — descriptions, projects, durations and billable flags. Use this when the question is about what specific work was done, not how much.",
      inputSchema: {
        since: DateArg.describe("First day of the range (inclusive), YYYY-MM-DD"),
        until: DateArg.describe("Last day of the range (inclusive), YYYY-MM-DD"),
        search: z
          .string()
          .max(200)
          .optional()
          .describe("Optional case-insensitive substring of the entry description"),
        timezoneOffsetMinutes: TimezoneArg,
      },
      annotations: READ_ONLY,
    },
    async ({ since, until, search, timezoneOffsetMinutes }) => {
      const { sinceIso, untilIso } = rangeToIso(since, until, timezoneOffsetMinutes);
      const clauses = [`te.workspace_id = ?`, `te.start >= ?`, `te.start < ?`];
      const bindings: unknown[] = [workspaceId, sinceIso, untilIso];
      const scope = await scopeUserId();
      if (scope) {
        clauses.push(`te.user_id = ?`);
        bindings.push(scope);
      }
      if (search?.trim()) {
        clauses.push(`te.description LIKE ? ESCAPE '\\'`);
        bindings.push(`%${search.trim().replace(/[%_\\]/g, "\\$&")}%`);
      }

      const { results } = await db
        .prepare(
          `${ENTRY_SELECT} WHERE ${clauses.join(" AND ")}
           GROUP BY te.id ORDER BY te.start DESC LIMIT ${ROW_LIMIT}`
        )
        .bind(...bindings)
        .all<TimeEntryJoinRow>();

      return json(
        results.map(formatEntry).map((e) => ({
          id: e.id,
          url: entryUrl(appUrl(env), e.start, e.id),
          date: e.start.slice(0, 10),
          start: e.start,
          stop: e.stop,
          hours: hours(e.duration ?? 0),
          description: e.description,
          project: e.projectName,
          task: e.taskName,
          billable: e.billable,
          tags: e.tags,
          running: e.stop === null,
        }))
      );
    }
  );

  server.registerTool(
    "get_running_timer",
    {
      title: "Check the running timer",
      description: "The timer running right now, if any, and how long it has been going.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const row = await db
        .prepare(
          `SELECT te.id, te.description, te.start, p.name AS project_name
           FROM time_entries te
           LEFT JOIN projects p ON p.id = te.project_id AND p.workspace_id = te.workspace_id
           WHERE te.workspace_id = ? AND te.user_id = ? AND te.stop IS NULL
           ORDER BY te.start DESC LIMIT 1`
        )
        .bind(workspaceId, userId)
        .first<McpRunningTimerRow>();

      if (!row) return json({ running: false });
      const elapsed = Date.now() - new Date(row.start).getTime();
      return json({
        running: true,
        id: row.id,
        description: row.description,
        project: row.project_name ?? null,
        startedAt: row.start,
        elapsedHours: Math.round((elapsed / 3_600_000) * 100) / 100,
      });
    }
  );

  server.registerTool(
    "list_drafts",
    {
      title: "List drafted entries",
      description:
        "Proposed time entries waiting for review on a given day, with why each was proposed. Drafts are NOT tracked time and do not appear in any report until a person confirms them in the app.",
      inputSchema: { date: DateArg.describe("The local day to inspect, YYYY-MM-DD") },
      annotations: READ_ONLY,
    },
    async ({ date }) => {
      const drafts = await listDrafts(db, workspaceId, ctx.userId, date);
      return json(
        drafts.map((d) => ({
          id: d.id,
          start: d.start,
          stop: d.stop,
          hours: hours(d.duration),
          description: d.description,
          project: d.projectName,
          billable: d.billable,
          source: d.source,
          confidence: d.confidence,
          why: d.reason,
        }))
      );
    }
  );

  server.registerTool(
    "get_time_entry",
    {
      title: "Get one time entry",
      description: "One entry in full — description, project, task, tags, billable flag, start and stop. A member can open only their own entries.",
      inputSchema: { entryId: IdArg("time entry (from list_time_entries)") },
      annotations: READ_ONLY,
    },
    async ({ entryId }) =>
      fromBridge(await bridge<TimeEntry>("GET", `/api/time_entries/${segment(entryId)}`), (e) => withEntryUrl(e, appUrl(env)))
  );

  server.registerTool(
    "run_report",
    {
      title: "Run a report",
      description:
        "The Reports page's own queries over a date range, with its filters and rounding. `summary` gives totals by project/client/task/tag and a time series; `grouped` a tree by `group` then `subGroup`; `weekly` a project-by-day grid; `detailed` every entry with its amount. Use get_time_summary for a quick total; this one when a filter, rounding or per-person view is asked for.",
      inputSchema: {
        kind: z.enum(["summary", "grouped", "weekly", "detailed"]),
        since: DateArg.describe("First day of the range (inclusive), YYYY-MM-DD"),
        until: DateArg.describe("Last day of the range (inclusive), YYYY-MM-DD"),
        timezoneOffsetMinutes: TimezoneArg,
        group: z.enum(["project", "client", "task", "tag", "user"]).optional().describe("grouped only"),
        subGroup: z.enum(["none", "project", "client", "task", "tag", "user"]).optional().describe("grouped only"),
        projectIds: z.array(z.string()).optional(),
        clientIds: z.array(z.string()).optional(),
        taskIds: z.array(z.string()).optional(),
        tagIds: z.array(z.string()).optional(),
        userIds: z.array(z.string()).optional().describe("Owner/admin only; ignored for a member, who sees their own hours"),
        billable: z.enum(["billable", "nonbillable"]).optional(),
        search: z.string().max(200).optional(),
        roundMode: z.enum(["off", "nearest", "up", "down"]).optional(),
        roundMinutes: z.number().int().min(0).max(1440).optional(),
      },
      annotations: READ_ONLY,
    },
    async ({ kind, since, until, timezoneOffsetMinutes, ...filters }) => {
      const { sinceIso, untilIso } = rangeToIso(since, until, timezoneOffsetMinutes);
      const query = new URLSearchParams({ since: sinceIso, until: untilIso });
      for (const [key, value] of Object.entries(filters)) {
        if (value === undefined) continue;
        query.set(key, Array.isArray(value) ? value.join(",") : String(value));
      }
      return fromBridge(await bridge("GET", `/api/reports/${kind}?${query}`));
    }
  );
}

export function registerEntryWrites(d: ToolDeps): void {
  const { server, ctx, env, workspaceId, bridge } = d;

  // One implementation shared by log_time and log_times.
  const logInput = {
    description: z.string().max(2000).describe("What the work was"),
    start: z.string().describe("ISO 8601 start instant with offset, e.g. 2026-09-18T14:00:00-03:00"),
    stop: z.string().describe("ISO 8601 stop instant, after start"),
    projectId: z.string().describe("A project id from list_projects — every entry needs one; ask the person rather than choosing for them"),
    taskId: z.string().optional().describe("Task id from list_tasks, to count the time against a task"),
    tags: z.array(z.string().max(100)).max(50).optional(),
    billable: z.boolean().optional().describe("Omit to log the entry as billable, the default for every entry"),
  };
  const logOne = async ({ start, stop, ...rest }: { start: string; stop: string; description: string; projectId: string; taskId?: string; tags?: string[]; billable?: boolean }): Promise<BridgeResult<TimeEntry>> => {
    const startMs = new Date(start).getTime();
    const stopMs = new Date(stop).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(stopMs)) return rejected("start and stop must be ISO 8601 timestamps.");
    if (stopMs <= startMs) return rejected("stop must be after start.");
    return bridge<TimeEntry>("POST", "/api/time_entries", {
      ...rest,
      start: new Date(startMs).toISOString(),
      stop: new Date(stopMs).toISOString(),
    });
  };
  const entryView = (e: TimeEntry) => withEntryUrl(e, appUrl(env));

  server.registerTool(
    "log_time",
    {
      title: "Log a time entry",
      description:
        "Record work that has already happened, exactly as the app's manual entry does. Times are ISO 8601 instants — resolve relative phrasing against the person's local time first. Needs a project from list_projects; ask which one rather than choosing. Returns the new entry, whose id update_time_entry and delete_time_entry take. Not idempotent: a second call logs a second entry. For more than one entry use log_times: one call, one approval.",
      inputSchema: logInput,
      annotations: MUTATES,
    },
    async (args) => fromBridge(await logOne(args), entryView)
  );
  server.registerTool(
    "log_times",
    {
      title: "Log several time entries",
      description:
        "Record several entries in one call (one approval), in order; each item is what log_time takes, with the same rules (ISO 8601 instants, a project from list_projects for each). Reports which went through and which didn't.",
      inputSchema: batchInput(logInput, "entries to log"),
      annotations: MUTATES,
    },
    async ({ items }) => runBatch(items, logOne, entryView)
  );

  server.registerTool(
    "draft_day",
    {
      title: "Draft a day's missing entries",
      description:
        "Propose the entries missing from a day, from calendar events that ended untracked, uncovered stretches between the day's activity, and work usually logged on that weekday. Proposals are NOT tracked time — they wait for a person to review and confirm them in the app.",
      inputSchema: {
        date: DateArg.describe("The local day to draft, YYYY-MM-DD"),
        timezoneOffsetMinutes: TimezoneArg,
      },
      // Idempotent by unique index on both the calendar event and the slot —
      // re-drafting a day proposes only what is still missing.
      annotations: { ...MUTATES, idempotentHint: true },
    },
    async ({ date, timezoneOffsetMinutes }) => {
      const result = await generateDrafts(
        env,
        workspaceId,
        ctx.userId,
        date,
        timezoneOffsetMinutes
      );
      return json({
        drafted: result.drafts.length,
        awaitingReview: result.drafts.map((d) => ({
          start: d.start,
          stop: d.stop,
          hours: hours(d.duration),
          description: d.description,
          project: d.projectName,
          why: d.reason,
        })),
      });
    }
  );

  server.registerTool(
    "update_time_entry",
    {
      title: "Edit a time entry",
      description:
        "Change an entry's description, project, task, start/stop, billable flag or tags — only the fields passed change. Same rules as editing it in the app: a member edits only their own entries, and a running entry only by its owner. `tags` replaces the whole list.",
      inputSchema: { entryId: IdArg("time entry"), ...UpdateTimeEntrySchema.shape },
      annotations: { ...MUTATES, idempotentHint: true },
    },
    async ({ entryId, ...patch }) =>
      fromBridge(await bridge<TimeEntry>("PUT", `/api/time_entries/${segment(entryId)}`, patch), (e) => withEntryUrl(e, appUrl(env)))
  );

  server.registerTool(
    "delete_time_entry",
    {
      title: "Delete a time entry",
      description: "Permanently remove one entry. Only when the person asked for this exact entry to go — confirm which one first.",
      inputSchema: { entryId: IdArg("time entry") },
      annotations: DESTRUCTIVE,
    },
    async ({ entryId }) => fromBridge(await bridge("DELETE", `/api/time_entries/${segment(entryId)}`))
  );

  server.registerTool(
    "update_time_entries",
    {
      title: "Edit several time entries",
      description:
        "Apply the same change (project, task, billable, tags, description) to many entries in one call (one approval). All or nothing: if any entry isn't the caller's to edit, none change. Ids from list_time_entries; `tags` replaces each entry's whole list.",
      inputSchema: {
        entryIds: z.array(IdArg("time entry")).min(1).max(BULK_ENTRY_IDS_MAX).describe("Entry ids from list_time_entries"),
        patch: BulkUpdateTimeEntriesSchema.shape.patch,
      },
      annotations: { ...MUTATES, idempotentHint: true },
    },
    async ({ entryIds, patch }) => fromBridge(await bridge("PATCH", "/api/time_entries/bulk", { ids: entryIds, patch }))
  );

  server.registerTool(
    "delete_time_entries",
    {
      title: "Delete several time entries",
      description:
        "Permanently remove many entries in one call (one approval). All or nothing: if any entry isn't the caller's to delete, none are. Only when the person asked for exactly these to go — list them and confirm first.",
      inputSchema: {
        entryIds: z.array(IdArg("time entry")).min(1).max(BULK_ENTRY_IDS_MAX).describe("Entry ids from list_time_entries"),
      },
      annotations: DESTRUCTIVE,
    },
    async ({ entryIds }) => fromBridge(await bridge("DELETE", "/api/time_entries/bulk", { ids: entryIds }))
  );

  server.registerTool(
    "copy_week",
    {
      title: "Copy a week of entries",
      description:
        "Copy the person's own entries from one week into another, shifted by whole weeks — the Timesheet's \"copy last week\". All or nothing: if any copied entry would be refused, nothing is created.",
      inputSchema: {
        sourceWeekStart: DateArg.describe("The first local day of the week to copy from, YYYY-MM-DD"),
        targetWeekStart: DateArg.describe("The first local day of the week to copy into, YYYY-MM-DD"),
        timezoneOffsetMinutes: TimezoneArg,
      },
      annotations: MUTATES,
    },
    async ({ sourceWeekStart, targetWeekStart, timezoneOffsetMinutes }) =>
      fromBridge(
        await bridge<{ created: unknown[] }>("POST", "/api/time_entries/copy-week", {
          sourceWeekStart: rangeToIso(sourceWeekStart, sourceWeekStart, timezoneOffsetMinutes).sinceIso,
          targetWeekStart: rangeToIso(targetWeekStart, targetWeekStart, timezoneOffsetMinutes).sinceIso,
        }),
        (r: { created: unknown[] }) => ({ copied: r.created.length, entries: r.created })
      )
  );
}
