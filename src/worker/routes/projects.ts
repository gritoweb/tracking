import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { CreateProjectSchema, UpdateProjectSchema } from "@shared/schemas";
import { DISTINCT_COLORS, spreadColor } from "../lib/colors";
import { runProjectColorAssignment } from "../lib/ai";
import { loadProjectPacing } from "../lib/pacing";
import { isActiveClient } from "../lib/clients";
import { canManageWorkspace, getMemberRole, MANAGER_ONLY_ERROR } from "../lib/permissions";
import { projectSelect, createProject, formatProject, memberProjectInput, projectMissingClient } from "../lib/projects";

/*
 * Projects reported an unqualified all-time total while Clients defaulted to
 * this month and Reports to the last seven days, so one project legitimately
 * read 15h, 4h 30m and 6h on three adjacent pages with only two of them saying
 * which window they meant. The list can now be asked for a window.
 *
 * Two totals, deliberately:
 *   tracked_seconds — the window the user asked for (all time when unscoped)
 *   budget_seconds  — always all time, because a budget is cumulative. Scoping
 *                     it to "this month" would make `11h / 40h` a sentence with
 *                     two different subjects.
 *
 * A member's totals cover only their own hours, and budgets are blanked (D3).
 */
function projectSelectRanged(scoped: boolean): string {
  return `
  SELECT p.*, c.name AS client_name,
    COALESCE(SUM(CASE WHEN te.start >= ? AND te.start <= ? THEN te.duration ELSE 0 END), 0) AS tracked_seconds,
    COALESCE(SUM(te.duration), 0) AS budget_seconds
  FROM projects p
  LEFT JOIN clients c ON c.id = p.client_id AND c.workspace_id = p.workspace_id
  LEFT JOIN time_entries te ON te.project_id = p.id AND te.workspace_id = p.workspace_id AND te.stop IS NOT NULL${scoped ? " AND te.user_id = ?" : ""}
`;
}

export const projectsRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const { includeArchived, since, until } = c.req.query();
    const manager = canManageWorkspace(await getMemberRole(c.env.DB, workspaceId, userId));
    const scope = manager ? [] : [userId];

    // Both or neither: half a range is not a range, and silently treating a
    // lone `since` as "onwards" would make the page's stated window a lie.
    const ranged = Boolean(since && until);
    const tail = `WHERE p.workspace_id = ? ${!includeArchived ? "AND p.active = 1" : ""}
       GROUP BY p.id ORDER BY p.name ASC`;

    const stmt = ranged
      ? c.env.DB.prepare(`${projectSelectRanged(!manager)} ${tail}`).bind(since, until, ...scope, workspaceId)
      : c.env.DB.prepare(`${projectSelect(!manager)} ${tail}`).bind(...scope, workspaceId);

    const { results } = await stmt.all<Record<string, unknown>>();

    return c.json(results.map((row) => formatProject(row, { hideBudget: !manager })));
  })
  .post("/", zValidator("json", CreateProjectSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const data = c.req.valid("json");
    if (!(await isActiveClient(c.env.DB, workspaceId, data.clientId))) {
      return c.json({ error: "Choose an active client in this workspace" }, 400);
    }
    const manager = canManageWorkspace(await getMemberRole(c.env.DB, workspaceId, c.get("userId")));
    const project = await createProject(c.env.DB, workspaceId, manager ? data : memberProjectInput(data));
    return c.json(project, 201);
  })
  // Auto-assign colors: ask Workers AI to give each project a distinct, sensibly
  // grouped palette color, then enforce distinctness + fill gaps with a
  // deterministic warm/cool spread so a poor/absent AI response never regresses.
  .post("/recolor", async (c) => {
    const workspaceId = c.get("workspaceId");
    if (!canManageWorkspace(await getMemberRole(c.env.DB, workspaceId, c.get("userId")))) {
      return c.json({ error: MANAGER_ONLY_ERROR }, 403);
    }
    const { results } = await c.env.DB.prepare(
      `SELECT id, name FROM projects WHERE workspace_id = ? ORDER BY name ASC`
    ).bind(workspaceId).all<{ id: string; name: string }>();

    if (!results.length) return c.json({ recolored: 0, usedAI: false });

    // AI suggestion (best-effort) keyed by exact project name.
    let aiColors = new Map<string, string>();
    let usedAI = false;
    try {
      aiColors = await runProjectColorAssignment(
        c.env.AI,
        results.map((r) => r.name)
      );
      usedAI = aiColors.size > 0;
    } catch {
      // AI unavailable / bad response — fall through to the deterministic spread.
    }

    // Assign in order: take the AI color when valid and not already used;
    // otherwise the next unused deterministic-spread color. Guarantees distinct
    // colors up to the palette size (18), then cycles.
    const used = new Set<string>();
    let spreadIdx = 0;
    const nextSpread = () => {
      // Advance to the next spread color not yet taken this run.
      for (let i = 0; i < DISTINCT_COLORS.length; i++) {
        const color = spreadColor(spreadIdx++);
        if (!used.has(color)) return color;
      }
      return spreadColor(spreadIdx++); // palette exhausted — allow reuse
    };

    const assignments = results.map((r) => {
      const ai = aiColors.get(r.name);
      const color = ai && !used.has(ai) ? ai : nextSpread();
      used.add(color);
      return { id: r.id, color };
    });

    const stmt = c.env.DB.prepare(
      `UPDATE projects SET color = ? WHERE id = ? AND workspace_id = ?`
    );
    await c.env.DB.batch(assignments.map((a) => stmt.bind(a.color, a.id, workspaceId)));

    return c.json({ recolored: assignments.length, usedAI });
  })
  // Budget pacing for every active project: share of budget spent, burn rate
  // over the trailing window, and where that rate lands the project by its end
  // date. Declared before "/:id" so the literal path isn't read as a project id.
  // A member gets an empty list: pacing is built from the whole team's hours.
  .get("/pacing", async (c) => {
    const workspaceId = c.get("workspaceId");
    if (!canManageWorkspace(await getMemberRole(c.env.DB, workspaceId, c.get("userId")))) {
      return c.json([]);
    }
    const pacing = await loadProjectPacing(c.env.DB, workspaceId);
    return c.json(pacing);
  })
  .get("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    const userId = c.get("userId");
    const manager = canManageWorkspace(await getMemberRole(c.env.DB, workspaceId, userId));
    const { results } = await c.env.DB.prepare(
      `${projectSelect(!manager)} WHERE p.id = ? AND p.workspace_id = ? GROUP BY p.id`
    ).bind(...(manager ? [] : [userId]), c.req.param("id"), workspaceId).all<Record<string, unknown>>();

    if (!results.length) return c.json({ error: "Not found" }, 404);
    return c.json(formatProject(results[0], { hideBudget: !manager }));
  })
  .put("/:id", zValidator("json", UpdateProjectSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const id = c.req.param("id");
    const data = c.req.valid("json");

    if (!canManageWorkspace(await getMemberRole(c.env.DB, workspaceId, c.get("userId")))) {
      // Members may fill a blank client (else they are stuck mid-entry), never change one.
      const fillingBlankClient =
        Object.keys(data).length === 1 &&
        typeof data.clientId === "string" &&
        (await projectMissingClient(c.env.DB, workspaceId, id));
      if (!fillingBlankClient) return c.json({ error: MANAGER_ONLY_ERROR }, 403);
    }
    if (data.clientId !== undefined && !(await isActiveClient(c.env.DB, workspaceId, data.clientId))) {
      return c.json({ error: "Choose an active client in this workspace" }, 400);
    }

    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined)           { fields.push("name = ?");           values.push(data.name); }
    if (data.color !== undefined)          { fields.push("color = ?");          values.push(data.color); }
    if (data.clientId !== undefined)       { fields.push("client_id = ?");      values.push(data.clientId); }
    if (data.billable !== undefined)       { fields.push("billable = ?");       values.push(data.billable ? 1 : 0); }
    if (data.rate !== undefined)           { fields.push("rate = ?");           values.push(data.rate ?? null); }
    if (data.active !== undefined)         { fields.push("active = ?");         values.push(data.active ? 1 : 0); }
    if (data.startDate !== undefined)      { fields.push("start_date = ?");     values.push(data.startDate ?? null); }
    if (data.endDate !== undefined)        { fields.push("end_date = ?");       values.push(data.endDate ?? null); }
    if (data.estimatedHours !== undefined) { fields.push("estimated_hours = ?"); values.push(data.estimatedHours ?? null); }
    if (data.integrationId !== undefined)     { fields.push("integration_id = ?");      values.push(data.integrationId ?? null); }
    if (data.externalProjectId !== undefined) { fields.push("external_project_id = ?");  values.push(data.externalProjectId ?? null); }
    if (data.externalTaskId !== undefined)    { fields.push("external_task_id = ?");     values.push(data.externalTaskId ?? null); }

    if (fields.length) {
      await c.env.DB.prepare(
        `UPDATE projects SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`
      ).bind(...values, id, workspaceId).run();
    }

    const { results } = await c.env.DB.prepare(
      `${projectSelect(false)} WHERE p.id = ? AND p.workspace_id = ? GROUP BY p.id`
    ).bind(id, workspaceId).all<Record<string, unknown>>();

    if (!results.length) return c.json({ error: "Not found" }, 404);
    return c.json(formatProject(results[0]));
  })
  .delete("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    if (!canManageWorkspace(await getMemberRole(c.env.DB, workspaceId, c.get("userId")))) {
      return c.json({ error: MANAGER_ONLY_ERROR }, 403);
    }
    await c.env.DB.prepare(
      `UPDATE projects SET active = 0 WHERE id = ? AND workspace_id = ?`
    ).bind(c.req.param("id"), workspaceId).run();
    return c.json({ ok: true });
  });
