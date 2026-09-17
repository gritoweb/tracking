import type { CreateProject, Project } from "@shared/schemas";
import { DISTINCT_COLORS, spreadColor } from "@shared/colors";
import type { ProjectRow } from "../db/rows";
import { inferEventProjects } from "./ai";

/** Project rows with their tracked time; `scoped` adds one `te.user_id = ?` binding (in the join, before the WHERE's) for a member. */
export function projectSelect(scoped: boolean): string {
  return `
  SELECT p.*, c.name AS client_name,
    COALESCE(SUM(te.duration), 0) AS tracked_seconds,
    COALESCE(SUM(te.duration), 0) AS budget_seconds
  FROM projects p
  LEFT JOIN clients c ON c.id = p.client_id AND c.workspace_id = p.workspace_id
  LEFT JOIN time_entries te ON te.project_id = p.id AND te.workspace_id = p.workspace_id AND te.stop IS NOT NULL${scoped ? " AND te.user_id = ?" : ""}
`;
}

export const PROJECT_SELECT = projectSelect(false);

/** `hideBudget` is for a member: budgets are team numbers they don't see (D3). */
export function formatProject(row: ProjectRow, opts: { hideBudget?: boolean } = {}): Project {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    clientId: row.client_id ?? null,
    clientName: row.client_name ?? null,
    name: row.name,
    color: row.color,
    billable: Boolean(row.billable),
    rate: row.rate ?? null,
    active: Boolean(row.active),
    startDate: row.start_date ?? null,
    endDate: row.end_date ?? null,
    estimatedHours: opts.hideBudget ? null : (row.estimated_hours ?? null),
    integrationId: row.integration_id ?? null,
    externalProjectId: row.external_project_id ?? null,
    externalTaskId: row.external_task_id ?? null,
    trackedSeconds: row.tracked_seconds ?? 0,
    budgetSeconds: opts.hideBudget ? 0 : (row.budget_seconds ?? row.tracked_seconds ?? 0),
    createdAt: row.created_at,
  };
}

/** A plain member creates a project by name, colour, client and billable flag; rates, budgets and integrations stay with managers. */
export function memberProjectInput(data: CreateProject): CreateProject {
  return { name: data.name, color: data.color, clientId: data.clientId, billable: data.billable };
}

/** Active project with a client — the only kind an entry, template or meeting may be logged against. */
export async function findActiveProject(
  db: D1Database,
  workspaceId: string,
  projectId: string
): Promise<{ id: string; name: string; billable: boolean } | null> {
  const row = await db
    .prepare(
      `SELECT id, name, billable FROM projects
       WHERE id = ? AND workspace_id = ? AND active = 1 AND client_id IS NOT NULL`
    )
    .bind(projectId, workspaceId)
    .first<{ id: string; name: string; billable: number }>();
  return row ? { id: row.id, name: row.name, billable: Boolean(row.billable) } : null;
}

/** Best-effort AI inference of a meeting title's project, shared by the assistant's chat tool and its track-event endpoint. */
export async function inferProjectForTitle(
  db: D1Database,
  ai: Ai,
  workspaceId: string,
  title: string
): Promise<{ projectId: string; projectName: string } | null> {
  try {
    const match = (await inferEventProjects(db, ai, workspaceId, [title])).get(title.trim());
    return match ? { projectId: match.projectId, projectName: match.projectName } : null;
  } catch (err) {
    console.warn("project inference from meeting title failed", { workspaceId, cause: String(err) });
    return null;
  }
}

/** Whether the project exists here with its client still blank — the one gap a member is allowed to fill. */
export async function projectMissingClient(
  db: D1Database,
  workspaceId: string,
  projectId: string
): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 FROM projects WHERE id = ? AND workspace_id = ? AND client_id IS NULL`)
    .bind(projectId, workspaceId)
    .first();
  return Boolean(row);
}

/** Shared by the REST route and the MCP `create_project` tool; callers check the client first. */
export async function createProject(db: D1Database, workspaceId: string, data: CreateProject): Promise<Project> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Colour is optional: when the caller doesn't pick one, take the first
  // palette entry this workspace isn't already using — see routes/projects.ts
  // for why a fixed default regressed the breakdown donut.
  let color = data.color;
  if (!color) {
    const { results: used } = await db
      .prepare(`SELECT color FROM projects WHERE workspace_id = ?`)
      .bind(workspaceId)
      .all<{ color: string }>();
    const taken = new Set(used.map((r) => r.color));
    color = DISTINCT_COLORS.find((candidate) => !taken.has(candidate)) ?? spreadColor(used.length);
  }

  await db
    .prepare(
      `INSERT INTO projects
         (id, workspace_id, client_id, name, color, billable, rate, active, start_date, end_date, estimated_hours, integration_id, external_project_id, external_task_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      workspaceId,
      data.clientId,
      data.name,
      color,
      data.billable ? 1 : 0,
      data.rate ?? null,
      data.startDate ?? null,
      data.endDate ?? null,
      data.estimatedHours ?? null,
      data.integrationId ?? null,
      data.externalProjectId ?? null,
      data.externalTaskId ?? null,
      now
    )
    .run();

  const row = await db
    .prepare(`${PROJECT_SELECT} WHERE p.id = ? AND p.workspace_id = ? GROUP BY p.id`)
    .bind(id, workspaceId)
    .first<ProjectRow>();
  if (!row) throw new Error("project insert did not produce a readable row");

  return formatProject(row);
}

/** One refusal text, so the rule reads the same on every write path. */
export const PROJECT_REQUIRED_ERROR =
  "Choose an active project that belongs to a client";
