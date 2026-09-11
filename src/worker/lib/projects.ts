import type { CreateProject } from "@shared/schemas";
import { DISTINCT_COLORS, spreadColor } from "./colors";

export const PROJECT_SELECT = `
  SELECT p.*, c.name AS client_name,
    COALESCE(SUM(te.duration), 0) AS tracked_seconds,
    COALESCE(SUM(te.duration), 0) AS budget_seconds
  FROM projects p
  LEFT JOIN clients c ON c.id = p.client_id AND c.workspace_id = p.workspace_id
  LEFT JOIN time_entries te ON te.project_id = p.id AND te.workspace_id = p.workspace_id AND te.stop IS NOT NULL
`;

export function formatProject(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    clientId: (row.client_id as string | null) ?? null,
    clientName: (row.client_name as string | null) ?? null,
    name: row.name as string,
    color: row.color as string,
    billable: Boolean(row.billable),
    rate: (row.rate as number | null) ?? null,
    active: Boolean(row.active),
    startDate: (row.start_date as string | null) ?? null,
    endDate: (row.end_date as string | null) ?? null,
    estimatedHours: (row.estimated_hours as number | null) ?? null,
    integrationId: (row.integration_id as string | null) ?? null,
    externalProjectId: (row.external_project_id as string | null) ?? null,
    externalTaskId: (row.external_task_id as string | null) ?? null,
    trackedSeconds: (row.tracked_seconds as number) ?? 0,
    budgetSeconds: (row.budget_seconds as number) ?? (row.tracked_seconds as number) ?? 0,
    createdAt: row.created_at as string,
  };
}

/** Shared by the REST route and the MCP `create_project` tool. */
export async function createProject(db: D1Database, workspaceId: string, data: CreateProject) {
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
      data.clientId ?? null,
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
    .first<Record<string, unknown>>();

  return formatProject(row!);
}
