// Favorites, recurring entries, saved reports and the Planner.
import { z } from "zod";
import type { RecurringEntry } from "@shared/schemas";
import { CreateFavoriteSchema, CreateSavedReportSchema, UpsertAllocationSchema } from "@shared/schemas";
import { localScheduleToUtcAt, utcScheduleToLocalAt } from "@shared/recurring-schedule";
import { segment } from "../rest-bridge";
import { DESTRUCTIVE, DateArg, IdArg, MUTATES, READ_ONLY, TimezoneArg, fromBridge, hours, refuse, type ToolDeps } from "../shared";

const LocalDaysArg = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .describe("Local weekdays, 0 = Sunday … 6 = Saturday");
const LocalTimeArg = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM (24h)")
  .describe("Local time of day the entry starts, HH:MM (24h)");

const minutesOf = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmmOf = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/** A template as the person thinks of it: their weekdays and time, not the stored UTC pair. */
function recurringView(r: RecurringEntry, offsetMinutes: number) {
  const local = utcScheduleToLocalAt(r.daysOfWeek, r.timeUtcMinutes, offsetMinutes);
  return {
    id: r.id,
    description: r.description,
    project: { id: r.projectId, name: r.projectName },
    task: r.taskId ? { id: r.taskId, name: r.taskName } : null,
    tags: r.tags,
    billable: r.billable,
    hours: hours(r.durationSeconds),
    localDays: local.days,
    localTime: hhmmOf(local.minutes),
    active: r.active,
    lastMaterialized: r.lastMaterialized,
  };
}

export function registerProductivityReads(d: ToolDeps): void {
  const { server, bridge } = d;

  server.registerTool(
    "list_favorites",
    {
      title: "List favorites",
      description: "The person's saved presets — description, project, task, tags and billable flag — as used by the app's one-click start.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => fromBridge(await bridge("GET", "/api/favorites"))
  );

  server.registerTool(
    "list_recurring",
    {
      title: "List recurring entries",
      description: "The person's recurring time templates with their local weekdays and start time. Each one logs a finished entry automatically on its days.",
      inputSchema: { timezoneOffsetMinutes: TimezoneArg },
      annotations: READ_ONLY,
    },
    async ({ timezoneOffsetMinutes }) =>
      fromBridge(await bridge<RecurringEntry[]>("GET", "/api/recurring"), (list) =>
        list.map((r) => recurringView(r, timezoneOffsetMinutes))
      )
  );

  server.registerTool(
    "list_saved_reports",
    {
      title: "List saved reports",
      description: "The person's bookmarked report views with their filters. Run one by passing its filters to run_report.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => fromBridge(await bridge("GET", "/api/saved-reports"))
  );

  server.registerTool(
    "get_planner",
    {
      title: "Read the Planner",
      description: "The person's planned hours per project/task per day in a date range — the plan, not tracked time. Compare with get_time_summary for plan vs actual.",
      inputSchema: {
        since: DateArg.describe("First local day, YYYY-MM-DD"),
        until: DateArg.describe("Last local day, YYYY-MM-DD"),
      },
      annotations: READ_ONLY,
    },
    async ({ since, until }) =>
      fromBridge(await bridge("GET", `/api/planner?${new URLSearchParams({ since, until })}`))
  );
}

export function registerProductivityWrites(d: ToolDeps): void {
  const { server, bridge } = d;

  server.registerTool(
    "create_favorite",
    {
      title: "Save a favorite",
      description: "Save a timer preset (description, project, task, tags, billable) the person can start in one click.",
      inputSchema: CreateFavoriteSchema.shape,
      annotations: MUTATES,
    },
    async (body) => fromBridge(await bridge("POST", "/api/favorites", body))
  );

  server.registerTool(
    "delete_favorite",
    {
      title: "Delete a favorite",
      description: "Remove a saved preset from the person's favorites. Tracked time is untouched; ids come from list_favorites.",
      inputSchema: { favoriteId: IdArg("favorite") },
      annotations: DESTRUCTIVE,
    },
    async ({ favoriteId }) => fromBridge(await bridge("DELETE", `/api/favorites/${segment(favoriteId)}`))
  );

  server.registerTool(
    "create_recurring",
    {
      title: "Create a recurring entry",
      description:
        "A template that logs a finished entry automatically on the given local weekdays at the given local time. Pass the person's timezoneOffsetMinutes so the schedule lands on their days.",
      inputSchema: {
        description: z.string().max(2000).default(""),
        projectId: IdArg("project"),
        taskId: z.string().nullable().optional(),
        tags: z.array(z.string().max(100)).max(50).default([]),
        billable: z.boolean().default(true),
        durationMinutes: z.number().int().min(1).max(1440),
        localDays: LocalDaysArg,
        localTime: LocalTimeArg,
        timezoneOffsetMinutes: TimezoneArg,
      },
      annotations: MUTATES,
    },
    async ({ durationMinutes, localDays, localTime, timezoneOffsetMinutes, ...rest }) => {
      const schedule = localScheduleToUtcAt(localDays, minutesOf(localTime), timezoneOffsetMinutes);
      return fromBridge(
        await bridge<RecurringEntry>("POST", "/api/recurring", {
          ...rest,
          durationSeconds: durationMinutes * 60,
          ...schedule,
        }),
        (r) => recurringView(r, timezoneOffsetMinutes)
      );
    }
  );

  server.registerTool(
    "update_recurring",
    {
      title: "Edit a recurring entry",
      description:
        "Change a recurring template — only the fields passed change. `active: false` pauses it. To change the schedule pass BOTH localDays and localTime, with timezoneOffsetMinutes.",
      inputSchema: {
        recurringId: IdArg("recurring entry"),
        description: z.string().max(2000).optional(),
        projectId: z.string().min(1).optional(),
        taskId: z.string().nullable().optional(),
        tags: z.array(z.string().max(100)).max(50).optional(),
        billable: z.boolean().optional(),
        durationMinutes: z.number().int().min(1).max(1440).optional(),
        localDays: LocalDaysArg.optional(),
        localTime: LocalTimeArg.optional(),
        active: z.boolean().optional(),
        timezoneOffsetMinutes: TimezoneArg,
      },
      annotations: { ...MUTATES, idempotentHint: true },
    },
    async ({ recurringId, durationMinutes, localDays, localTime, timezoneOffsetMinutes, ...rest }) => {
      if ((localDays === undefined) !== (localTime === undefined)) {
        return refuse("Pass localDays and localTime together — the stored UTC weekday depends on both.");
      }
      const schedule =
        localDays && localTime
          ? localScheduleToUtcAt(localDays, minutesOf(localTime), timezoneOffsetMinutes)
          : {};
      return fromBridge(
        await bridge<RecurringEntry>("PUT", `/api/recurring/${segment(recurringId)}`, {
          ...rest,
          ...(durationMinutes === undefined ? {} : { durationSeconds: durationMinutes * 60 }),
          ...schedule,
        }),
        (r) => recurringView(r, timezoneOffsetMinutes)
      );
    }
  );

  server.registerTool(
    "delete_recurring",
    {
      title: "Delete a recurring entry",
      description: "Delete a recurring template. Entries it already logged stay. Use update_recurring `active: false` to pause instead.",
      inputSchema: { recurringId: IdArg("recurring entry") },
      annotations: DESTRUCTIVE,
    },
    async ({ recurringId }) => fromBridge(await bridge("DELETE", `/api/recurring/${segment(recurringId)}`))
  );

  server.registerTool(
    "create_saved_report",
    {
      title: "Save a report view",
      description: "Bookmark a report view under a name. `config` holds the filters (the same keys run_report takes).",
      inputSchema: CreateSavedReportSchema.shape,
      annotations: MUTATES,
    },
    async (body) => fromBridge(await bridge("POST", "/api/saved-reports", body))
  );

  server.registerTool(
    "delete_saved_report",
    {
      title: "Delete a saved report",
      description: "Remove a bookmarked report view. The entries it reported on are untouched; ids come from list_saved_reports.",
      inputSchema: { reportId: IdArg("saved report") },
      annotations: DESTRUCTIVE,
    },
    async ({ reportId }) => fromBridge(await bridge("DELETE", `/api/saved-reports/${segment(reportId)}`))
  );

  server.registerTool(
    "set_planner_hours",
    {
      title: "Plan hours in the Planner",
      description: "Set the person's planned seconds for a project (and optional task) on one local day. 0 clears the cell. This is a plan, not tracked time.",
      inputSchema: UpsertAllocationSchema.shape,
      annotations: { ...MUTATES, idempotentHint: true },
    },
    async (body) => fromBridge(await bridge("PUT", "/api/planner", body))
  );
}
