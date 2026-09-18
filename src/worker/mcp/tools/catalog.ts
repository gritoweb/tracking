// Projects, clients and tags.
import { loadProjectPacing } from "../../lib/pacing";
import { createClient, isActiveClient } from "../../lib/clients";
import { createProject, memberProjectInput } from "../../lib/projects";
import { CreateClientSchema, CreateProjectSchema, CreateTagSchema, UpdateClientSchema, UpdateProjectSchema, UpdateTagSchema } from "@shared/schemas";
import { segment } from "../rest-bridge";
import { DESTRUCTIVE, IdArg, MUTATES, READ_ONLY, compact, fromBridge, hours, json, refuse, type ToolDeps } from "../shared";

/** `list_projects`'s own projection: a project plus its client name and tracked total. */
interface McpProjectRow {
  id: string;
  name: string;
  billable: number;
  rate: number | null;
  estimated_hours: number | null;
  start_date: string | null;
  end_date: string | null;
  client_name: string | null;
  tracked: number;
}

/** `list_clients`'s own projection. */
interface McpClientRow {
  id: string;
  name: string;
  archived: number;
  project_count: number;
}

export function registerCatalogReads(d: ToolDeps): void {
  const { server, db, workspaceId, scopeUserId, bridge } = d;

  server.registerTool(
    "list_projects",
    {
      title: "List projects",
      description:
        "Every active project in the workspace with its client, whether the project itself is billable, hourly rate, time budget and total tracked time. Call this first when a question names a project or client. `needsClient: true` marks a project that cannot take time until a person links its client in the app.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const { results } = await db
        .prepare(
          `SELECT p.id, p.name, p.billable, p.rate, p.estimated_hours, p.start_date, p.end_date,
                  c.name AS client_name,
                  COALESCE(SUM(te.duration), 0) AS tracked
           FROM projects p
           LEFT JOIN clients c ON c.id = p.client_id AND c.workspace_id = p.workspace_id
           LEFT JOIN time_entries te
             ON te.project_id = p.id AND te.workspace_id = p.workspace_id AND te.stop IS NOT NULL
             AND (?1 IS NULL OR te.user_id = ?1)
           WHERE p.workspace_id = ?2 AND p.active = 1
           GROUP BY p.id ORDER BY p.name ASC`
        )
        .bind(await scopeUserId(), workspaceId)
        .all<McpProjectRow>();
      const manager = (await scopeUserId()) === null;

      return json(
        results.map((r) => ({
          id: r.id,
          name: r.name,
          client: r.client_name ?? null,
          needsClient: r.client_name == null,
          billable: Boolean(r.billable),
          hourlyRate: r.rate ?? null,
          budgetHours: manager ? (r.estimated_hours ?? null) : null,
          trackedHours: hours(r.tracked ?? 0),
          startDate: r.start_date ?? null,
          endDate: r.end_date ?? null,
        }))
      );
    }
  );

  server.registerTool(
    "list_clients",
    {
      title: "List clients",
      description: "Every client in the workspace, with how many projects each has.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      const { results } = await db
        .prepare(
          `SELECT c.id, c.name, c.archived, COUNT(p.id) AS project_count
           FROM clients c
           LEFT JOIN projects p ON p.client_id = c.id AND p.workspace_id = c.workspace_id
           WHERE c.workspace_id = ?
           GROUP BY c.id ORDER BY c.name ASC`
        )
        .bind(workspaceId)
        .all<McpClientRow>();
      return json(
        results.map((r) => ({
          id: r.id,
          name: r.name,
          archived: Boolean(r.archived),
          projectCount: r.project_count,
        }))
      );
    }
  );

  server.registerTool(
    "get_project_pacing",
    {
      title: "Check project budgets",
      description:
        "For every budgeted project: how much of the budget is spent, the recent burn rate per working day, working days left before the end date, and whether the current rate overruns the budget. Use this for 'which projects are at risk' and 'am I going to blow the budget on X'.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => {
      if ((await scopeUserId()) !== null) {
        return refuse("Project budgets are visible to workspace owners and admins only.");
      }
      const pacing = await loadProjectPacing(db, workspaceId);
      return json(
        pacing.map((p) => ({
          project: p.projectName,
          client: p.clientName,
          status: p.status,
          budgetHours: p.estimatedSeconds ? hours(p.estimatedSeconds) : null,
          trackedHours: hours(p.trackedSeconds),
          percentUsed: p.percentUsed === null ? null : Math.round(p.percentUsed * 100),
          burnHoursPerWorkingDay: hours(p.burnPerWorkingDay),
          workingDaysRemaining: p.workingDaysRemaining,
          projectedHours: p.projectedSeconds === null ? null : hours(p.projectedSeconds),
          projectedOverrunHours:
            p.projectedOverrunSeconds === null ? null : hours(p.projectedOverrunSeconds),
          endDate: p.endDate,
        }))
      );
    }
  );

  server.registerTool(
    "list_tags",
    {
      title: "List tags",
      description: "Every tag in the workspace with its colour. Entries carry tags by name.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () => fromBridge(await bridge("GET", "/api/tags"))
  );
}

export function registerCatalogWrites(d: ToolDeps): void {
  const { server, db, workspaceId, scopeUserId, bridge } = d;

  server.registerTool(
    "create_client",
    {
      title: "Create a client",
      description:
        "Add a new client to the workspace. Only when the person asked for this client by name — never invent one to satisfy another call. Use list_clients first to check it doesn't already exist under a slightly different name.",
      inputSchema: CreateClientSchema.shape,
      // Deliberately NOT idempotent: calling it twice makes two clients of the
      // same name, matching create_project and log_time.
      annotations: MUTATES,
    },
    async (data) => {
      const client = await createClient(db, workspaceId, data);
      return json(compact(client));
    }
  );

  server.registerTool(
    "create_project",
    {
      title: "Create a project",
      description:
        "Add a new project to the workspace under a client — every project needs one. Only when the person asked for this project. Use list_clients for the clientId and ask them which client when they didn't name one; never guess it or invent a client.",
      inputSchema: CreateProjectSchema.shape,
      annotations: MUTATES,
    },
    async (data) => {
      if (!(await isActiveClient(db, workspaceId, data.clientId))) {
        return refuse(`No active client with id ${data.clientId} in this workspace. Call list_clients and ask the person which client this project belongs to.`);
      }
      const manager = (await scopeUserId()) === null;
      const project = await createProject(db, workspaceId, manager ? data : memberProjectInput(data));
      return json(compact(project));
    }
  );

  server.registerTool(
    "update_project",
    {
      title: "Edit a project",
      description:
        "Change a project's name, colour, client, rate, billable classification, dates or hour budget — only the fields passed change. Workspace owners/admins only (a member may only fill in a missing client). `active: true` brings back an archived project.",
      inputSchema: { projectId: IdArg("project"), ...UpdateProjectSchema.shape },
      annotations: { ...MUTATES, idempotentHint: true },
    },
    async ({ projectId, ...patch }) =>
      fromBridge(await bridge("PUT", `/api/projects/${segment(projectId)}`, patch))
  );

  server.registerTool(
    "archive_project",
    {
      title: "Archive a project",
      description: "Archive a project so it takes no new time. Its tracked hours stay in every report. Owners/admins only; reversible with update_project `active: true`.",
      inputSchema: { projectId: IdArg("project") },
      annotations: { ...DESTRUCTIVE, idempotentHint: true },
    },
    async ({ projectId }) => fromBridge(await bridge("DELETE", `/api/projects/${segment(projectId)}`))
  );

  server.registerTool(
    "update_client",
    {
      title: "Edit a client",
      description: "Change a client's name, notes, email, phone or address — only the fields passed change. `archived: false` restores an archived client. Owners/admins only.",
      inputSchema: { clientId: IdArg("client"), ...UpdateClientSchema.shape },
      annotations: { ...MUTATES, idempotentHint: true },
    },
    async ({ clientId, ...patch }) =>
      fromBridge(await bridge("PUT", `/api/clients/${segment(clientId)}`, patch))
  );

  server.registerTool(
    "archive_client",
    {
      title: "Archive a client",
      description: "Archive a client. Its projects and hours stay; reversible with update_client `archived: false`. Owners/admins only.",
      inputSchema: { clientId: IdArg("client") },
      annotations: { ...DESTRUCTIVE, idempotentHint: true },
    },
    async ({ clientId }) => fromBridge(await bridge("DELETE", `/api/clients/${segment(clientId)}`))
  );

  server.registerTool(
    "create_tag",
    {
      title: "Create a tag",
      description: "Add a tag (returns the existing one when the name is already taken). It gets the next unused palette colour.",
      inputSchema: CreateTagSchema.shape,
      annotations: { ...MUTATES, idempotentHint: true },
    },
    async (body) => fromBridge(await bridge("POST", "/api/tags", body))
  );

  server.registerTool(
    "update_tag",
    {
      title: "Recolour a tag",
      description: "Set a tag's colour (#rrggbb) — the colour it shows with on entries and reports. Get the tagId from list_tags.",
      inputSchema: { tagId: IdArg("tag"), ...UpdateTagSchema.shape },
      annotations: { ...MUTATES, idempotentHint: true },
    },
    async ({ tagId, ...body }) => fromBridge(await bridge("PATCH", `/api/tags/${segment(tagId)}`, body))
  );

  server.registerTool(
    "delete_tag",
    {
      title: "Delete a tag",
      description: "Delete a tag and remove it from every entry that carried it. The entries themselves stay. Confirm with the person first.",
      inputSchema: { tagId: IdArg("tag") },
      annotations: DESTRUCTIVE,
    },
    async ({ tagId }) => fromBridge(await bridge("DELETE", `/api/tags/${segment(tagId)}`))
  );
}
