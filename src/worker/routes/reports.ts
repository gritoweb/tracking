import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { NEUTRAL_SWATCH } from "@shared/colors";
import {
  ReportQuerySchema,
  GroupedReportQuerySchema,
  type ReportSummary,
  type ReportBreakdownRow,
  type GroupedReport,
  type ReportGroupRow,
  type ReportWeekly,
  type ReportDetailedEntry,
} from "@shared/schemas";
import { buildReportWhere, durationExpr } from "../db/queries";
import { entryScopeUserId, getMemberRole } from "../lib/permissions";

type RoundMode = "off" | "nearest" | "up" | "down";

// /detailed was the only unbounded row fetch in the API (the entries list caps
// at ENTRY_LIST_LIMIT). This cap protects the worker from buffering a multi-MB
// JSON body on an "All dates" range — far above any realistic report today;
// revisit with real pagination if a workspace ever hits it.
const DETAILED_ROW_LIMIT = 10_000;

// The filter/rounding fields every report query reads (since/until required).
interface ReportQuery {
  since: string;
  until: string;
  projectIds?: string[];
  clientIds?: string[];
  taskIds?: string[];
  tagIds?: string[];
  userIds?: string[];
  billable?: "billable" | "nonbillable";
  search?: string;
  roundMode?: RoundMode;
  roundMinutes?: number;
}

// Pull the shared filter args out of a validated query.
function filterArgs(q: ReportQuery, workspaceId: string, scopeUserId: string | null) {
  return {
    workspaceId,
    since: q.since,
    until: q.until,
    projectIds: q.projectIds,
    clientIds: q.clientIds,
    taskIds: q.taskIds,
    tagIds: q.tagIds,
    userIds: q.userIds,
    billable: q.billable,
    search: q.search,
    scopeUserId,
  };
}

/** Enforced here, never by the UI: a member's reports cover only their own hours, whatever `userIds` says. */
async function reportScope(c: {
  env: Env;
  get: (key: "workspaceId" | "userId") => string;
}): Promise<string | null> {
  const userId = c.get("userId");
  return entryScopeUserId(await getMemberRole(c.env.DB, c.get("workspaceId"), userId), userId);
}

// Aggregation expressions parameterised by the (optionally rounded) duration.
// Amounts are a row-level product summed → correct across mixed project rates.
function exprs(q: { roundMode?: RoundMode; roundMinutes?: number }) {
  const dur = durationExpr(q.roundMode, q.roundMinutes);
  return {
    dur,
    total: `SUM(${dur})`,
    billable: `SUM(CASE WHEN te.billable = 1 THEN ${dur} ELSE 0 END)`,
    amount: `SUM((CASE WHEN te.billable = 1 THEN ${dur} ELSE 0 END) * COALESCE(p.rate, 0) / 3600.0)`,
  };
}

// Grouped-summary dimension → SQL column + display-name + color expressions.
const DIM: Record<
  string,
  { col: string; name: string; color: string; needs?: "clients" | "tasks" | "tags" | "users" }
> = {
  project: { col: "te.project_id", name: "COALESCE(p.name, 'No project')", color: "p.color" },
  client: { col: "p.client_id", name: "COALESCE(cl.name, 'No client')", color: "NULL", needs: "clients" },
  task: { col: "te.task_id", name: "COALESCE(tk.name, 'No task')", color: "NULL", needs: "tasks" },
  tag: { col: "t.id", name: "COALESCE(t.name, 'No tag')", color: "NULL", needs: "tags" },
  user: {
    col: "te.user_id",
    name: "COALESCE(NULLIF(u.name, ''), u.email, 'No author')",
    color: "NULL",
    needs: "users",
  },
};

// ─── Row shapes for this file's own aggregation queries (not a table's own row) ──

/** `db.batch()` shares one row type across all six `/summary` aggregates, so this is the union of what any one selects. */
interface SummaryBatchRow {
  entry_count?: number | null;
  total_seconds?: number | null;
  billable_seconds?: number | null;
  billable_amount?: number | null;
  id?: string | null;
  name?: string | null;
  color?: string | null;
  date?: string;
}

/** Same reasoning as `SummaryBatchRow`, for `/grouped`'s two-statement batch (grouped rows + grand totals). */
interface GroupedBatchRow {
  entry_count: number | null;
  total_seconds: number | null;
  billable_seconds: number | null;
  billable_amount: number | null;
  g_id?: string | null;
  g_name?: string | null;
  g_color?: string | null;
  s_id?: string | null;
  s_name?: string | null;
  s_color?: string | null;
}

interface WeeklyRow {
  date: string;
  week: string;
  total_seconds: number | null;
  billable_seconds: number | null;
  entry_count: number;
}

/** `/detailed`: every `time_entries` column plus the rounded duration and every display join. */
interface DetailedRow {
  id: string;
  description: string | null;
  project_id: string | null;
  task_id: string | null;
  user_id: string | null;
  start: string;
  stop: string | null;
  billable: number;
  rounded_duration: number | null;
  project_name: string | null;
  project_color: string | null;
  project_rate: number | null;
  client_name: string | null;
  task_name: string | null;
  user_name: string | null;
  user_email: string | null;
  user_image: string | null;
  tag_names: string | null;
}

export const reportsRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  .get("/summary", zValidator("query", ReportQuerySchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const q = c.req.valid("query");
    const { where, bindings } = buildReportWhere(filterArgs(q, workspaceId, await reportScope(c)));
    const e = exprs(q);

    // All six aggregations share the same WHERE/bindings — one db.batch() round
    // trip (consistent snapshot) instead of six serial D1 queries, which from a
    // far-away PoP is the difference between ~1 RTT and ~6.
    const [totalsRes, byProjectRes, byClientRes, byTaskRes, byTagRes, dailyRes] =
      await c.env.DB.batch<SummaryBatchRow>([
        // Total stats
        c.env.DB.prepare(
          `
      SELECT
        COUNT(*) as entry_count,
        ${e.total} as total_seconds,
        ${e.billable} as billable_seconds,
        ${e.amount} as billable_amount
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      WHERE ${where}
    `
        ).bind(...bindings),
        // By project
        c.env.DB.prepare(
          `
      SELECT
        p.id as id, p.name as name, p.color as color,
        COUNT(*) as entry_count,
        ${e.total} as total_seconds,
        ${e.billable} as billable_seconds,
        ${e.amount} as billable_amount
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      WHERE ${where}
      GROUP BY te.project_id
      ORDER BY total_seconds DESC
    `
        ).bind(...bindings),
        // By client
        c.env.DB.prepare(
          `
      SELECT
        p.client_id as id, COALESCE(cl.name, 'No client') as name,
        COUNT(*) as entry_count,
        ${e.total} as total_seconds,
        ${e.billable} as billable_seconds,
        ${e.amount} as billable_amount
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      LEFT JOIN clients cl ON cl.id = p.client_id
      WHERE ${where}
      GROUP BY p.client_id
      ORDER BY total_seconds DESC
    `
        ).bind(...bindings),
        // By task
        c.env.DB.prepare(
          `
      SELECT
        te.task_id as id, COALESCE(tk.name, 'No task') as name,
        COUNT(*) as entry_count,
        ${e.total} as total_seconds,
        ${e.billable} as billable_seconds,
        ${e.amount} as billable_amount
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      LEFT JOIN tasks tk ON tk.id = te.task_id
      WHERE ${where}
      GROUP BY te.task_id
      ORDER BY total_seconds DESC
    `
        ).bind(...bindings),
        // By tag — joins tags, so an entry with N tags counts toward N tags.
        c.env.DB.prepare(
          `
      SELECT
        t.id as id, COALESCE(t.name, 'No tag') as name,
        COUNT(DISTINCT te.id) as entry_count,
        ${e.total} as total_seconds,
        ${e.billable} as billable_seconds,
        ${e.amount} as billable_amount
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      LEFT JOIN time_entry_tags tet ON tet.time_entry_id = te.id
      LEFT JOIN tags t ON t.id = tet.tag_id
      WHERE ${where}
      GROUP BY t.id
      ORDER BY total_seconds DESC
    `
        ).bind(...bindings),
        // Daily breakdown
        c.env.DB.prepare(
          `
      SELECT
        date(te.start) as date,
        ${e.total} as total_seconds,
        ${e.billable} as billable_seconds,
        COUNT(*) as entry_count
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      WHERE ${where}
      GROUP BY date(te.start)
      ORDER BY date ASC
    `
        ).bind(...bindings),
      ]);
    const totals = totalsRes.results;
    const byProject = byProjectRes.results;
    const byClient = byClientRes.results;
    const byTask = byTaskRes.results;
    const byTag = byTagRes.results;
    const daily = dailyRes.results;

    const mapBreakdown = (
      rows: SummaryBatchRow[],
      noneLabel: string,
      defaultColor?: string
    ): ReportBreakdownRow[] =>
      rows.map((r) => ({
        id: r.id ?? null,
        name: r.name ?? noneLabel,
        ...(defaultColor !== undefined ? { color: r.color ?? defaultColor } : {}),
        entryCount: r.entry_count ?? 0,
        totalSeconds: r.total_seconds ?? 0,
        billableSeconds: r.billable_seconds ?? 0,
        billableAmount: r.billable_amount ?? 0,
      }));

    return c.json({
      totalSeconds: totals[0]?.total_seconds ?? 0,
      billableSeconds: totals[0]?.billable_seconds ?? 0,
      billableAmount: totals[0]?.billable_amount ?? 0,
      entryCount: totals[0]?.entry_count ?? 0,
      byProject: mapBreakdown(byProject, "No project", NEUTRAL_SWATCH),
      byClient: mapBreakdown(byClient, "No client"),
      byTask: mapBreakdown(byTask, "No task"),
      byTag: mapBreakdown(byTag, "No tag"),
      daily: daily.map((r) => ({
        date: r.date ?? "",
        totalSeconds: r.total_seconds ?? 0,
        billableSeconds: r.billable_seconds ?? 0,
        entryCount: r.entry_count ?? 0,
      })),
    } satisfies ReportSummary, 200);
  })
  .get(
    "/grouped",
    zValidator("query", GroupedReportQuerySchema),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const q = c.req.valid("query");
      const { where, bindings } = buildReportWhere(filterArgs(q, workspaceId, await reportScope(c)));
      const e = exprs(q);

      const g = DIM[q.group];
      const sub = q.subGroup === "none" ? null : DIM[q.subGroup];

      // Assemble only the joins the chosen dimensions require.
      const needs = new Set([g.needs, sub?.needs].filter(Boolean));
      const joins = ["LEFT JOIN projects p ON p.id = te.project_id"];
      if (needs.has("clients"))
        joins.push("LEFT JOIN clients cl ON cl.id = p.client_id");
      if (needs.has("tasks"))
        joins.push("LEFT JOIN tasks tk ON tk.id = te.task_id");
      if (needs.has("tags")) {
        joins.push("LEFT JOIN time_entry_tags tet ON tet.time_entry_id = te.id");
        joins.push("LEFT JOIN tags t ON t.id = tet.tag_id");
      }
      if (needs.has("users"))
        joins.push(`LEFT JOIN "user" u ON u.id = te.user_id`);

      const cols = [
        `${g.col} as g_id`,
        `${g.name} as g_name`,
        `${g.color} as g_color`,
      ];
      const groupBy = [g.col];
      if (sub) {
        cols.push(`${sub.col} as s_id`, `${sub.name} as s_name`, `${sub.color} as s_color`);
        groupBy.push(sub.col);
      }

      // Grouped rows + grand totals (a separate statement so tag double-counting
      // never inflates them) in one batched round trip.
      const [groupedRes, totalsRes] = await c.env.DB.batch<GroupedBatchRow>([
        c.env.DB.prepare(
          `
        SELECT ${cols.join(", ")},
          COUNT(DISTINCT te.id) as entry_count,
          ${e.total} as total_seconds,
          ${e.billable} as billable_seconds,
          ${e.amount} as billable_amount
        FROM time_entries te
        ${joins.join("\n        ")}
        WHERE ${where}
        GROUP BY ${groupBy.join(", ")}
        ORDER BY total_seconds DESC
      `
        ).bind(...bindings),
        c.env.DB.prepare(
          `
        SELECT COUNT(*) as entry_count, ${e.total} as total_seconds,
          ${e.billable} as billable_seconds, ${e.amount} as billable_amount
        FROM time_entries te
        LEFT JOIN projects p ON p.id = te.project_id
        WHERE ${where}
      `
        ).bind(...bindings),
      ]);
      const results = groupedRes.results;
      const totals = totalsRes.results;

      // Nest rows into group → subGroup.
      const groups = new Map<string, ReportGroupRow>();
      for (const r of results) {
        const gid = r.g_id ?? "__none__";
        let grp = groups.get(gid);
        if (!grp) {
          grp = {
            id: r.g_id ?? null,
            name: r.g_name ?? "—",
            color: r.g_color ?? null,
            entryCount: 0,
            totalSeconds: 0,
            billableSeconds: 0,
            billableAmount: 0,
            subGroups: sub ? [] : undefined,
          };
          groups.set(gid, grp);
        }
        const secs = r.total_seconds ?? 0;
        const bsecs = r.billable_seconds ?? 0;
        const amt = r.billable_amount ?? 0;
        const cnt = r.entry_count ?? 0;
        grp.totalSeconds += secs;
        grp.billableSeconds += bsecs;
        grp.billableAmount += amt;
        grp.entryCount += cnt;
        if (sub) {
          grp.subGroups?.push({
            id: r.s_id ?? null,
            name: r.s_name ?? "—",
            color: r.s_color ?? null,
            entryCount: cnt,
            totalSeconds: secs,
            billableSeconds: bsecs,
            billableAmount: amt,
          });
        }
      }

      return c.json({
        group: q.group,
        subGroup: q.subGroup,
        totalSeconds: totals[0]?.total_seconds ?? 0,
        billableSeconds: totals[0]?.billable_seconds ?? 0,
        billableAmount: totals[0]?.billable_amount ?? 0,
        entryCount: totals[0]?.entry_count ?? 0,
        groups: [...groups.values()],
      } satisfies GroupedReport, 200);
    }
  )
  .get(
    "/weekly",
    zValidator("query", ReportQuerySchema.partial().required({ since: true, until: true })),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const q = c.req.valid("query");
      const { where, bindings } = buildReportWhere(filterArgs(q, workspaceId, await reportScope(c)));
      const e = exprs(q);

      const { results } = await c.env.DB.prepare(
        `
      SELECT
        date(te.start) as date,
        strftime('%Y-W%W', te.start) as week,
        ${e.total} as total_seconds,
        ${e.billable} as billable_seconds,
        COUNT(*) as entry_count
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      WHERE ${where}
      GROUP BY date(te.start)
      ORDER BY date ASC
      `
      )
        .bind(...bindings)
        .all<WeeklyRow>();

      const weekMap = new Map<string, ReportWeekly>();
      for (const r of results) {
        const week = r.week;
        let bucket = weekMap.get(week);
        if (!bucket) {
          bucket = { week, days: [] };
          weekMap.set(week, bucket);
        }
        bucket.days.push({
          date: r.date,
          totalSeconds: r.total_seconds ?? 0,
          billableSeconds: r.billable_seconds ?? 0,
          entryCount: r.entry_count ?? 0,
        });
      }

      return c.json([...weekMap.values()] satisfies ReportWeekly[], 200);
    }
  )
  .get(
    "/detailed",
    zValidator("query", ReportQuerySchema.partial().required({ since: true, until: true })),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const q = c.req.valid("query");
      const { where, bindings } = buildReportWhere(filterArgs(q, workspaceId, await reportScope(c)));
      const dur = durationExpr(q.roundMode, q.roundMinutes);

      const { results } = await c.env.DB.prepare(
        `
      SELECT te.*,
        ${dur} as rounded_duration,
        p.name as project_name, p.color as project_color, p.rate as project_rate,
        c.name as client_name,
        tk.name as task_name,
        u.name as user_name, u.email as user_email, u.image as user_image,
        GROUP_CONCAT(t.name) as tag_names
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN tasks tk ON tk.id = te.task_id
      LEFT JOIN "user" u ON u.id = te.user_id
      LEFT JOIN time_entry_tags tet ON tet.time_entry_id = te.id
      LEFT JOIN tags t ON t.id = tet.tag_id
      WHERE ${where}
      GROUP BY te.id
      ORDER BY te.start DESC
      LIMIT ${DETAILED_ROW_LIMIT}
    `
      )
        .bind(...bindings)
        .all<DetailedRow>();

      return c.json(
        results.map((r): ReportDetailedEntry => {
          const billable = Boolean(r.billable);
          const duration = r.rounded_duration ?? 0;
          const rate = r.project_rate ?? 0;
          return {
            id: r.id,
            description: r.description ?? "",
            projectId: r.project_id ?? null,
            projectName: r.project_name ?? null,
            projectColor: r.project_color ?? null,
            clientName: r.client_name ?? null,
            taskId: r.task_id ?? null,
            taskName: r.task_name ?? null,
            userId: r.user_id ?? null,
            userName: r.user_name ?? null,
            userEmail: r.user_email ?? null,
            userImage: r.user_image ?? null,
            start: r.start,
            stop: r.stop,
            duration,
            billable,
            amount: billable ? (duration / 3600) * rate : 0,
            tags: r.tag_names
              ? String(r.tag_names).split(",").filter(Boolean)
              : [],
          };
        }),
        200
      );
    }
  );
