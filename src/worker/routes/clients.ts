import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { CreateClientSchema, UpdateClientSchema } from "@shared/schemas";
import { buildReportWhere } from "../db/queries";
import { createClient, formatClient } from "../lib/clients";
import {
  canManageWorkspace,
  entryScopeUserId,
  getMemberRole,
  MANAGER_ONLY_ERROR,
} from "../lib/permissions";

export const clientsRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  .get("/", async (c) => {
    const workspaceId = c.get("workspaceId");
    const { includeArchived } = c.req.query();

    const { results } = await c.env.DB.prepare(
      `
      SELECT * FROM clients
      WHERE workspace_id = ?
        ${!includeArchived ? "AND archived = 0" : ""}
      ORDER BY name ASC
    `
    )
      .bind(workspaceId)
      .all<Record<string, unknown>>();

    return c.json(results.map(formatClient));
  })
  .post("/", zValidator("json", CreateClientSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const data = c.req.valid("json");
    const client = await createClient(c.env.DB, workspaceId, data);
    return c.json(client, 201);
  })
  /**
   * Per-client totals for a date window — what the Clients page shows instead
   * of a name and a chevron.
   *
   * Deliberately the same aggregation the reports `byClient` breakdown uses
   * (shared `buildReportWhere`, the same billable/amount expressions), so the
   * two screens can never disagree about what a client is worth. Amount is a
   * row-level product summed rather than hours × one rate, which is what keeps
   * it correct across projects on different rates.
   *
   * Rounding is deliberately NOT applied: rounding is a reporting preference
   * that belongs to an invoice you are about to send, and silently applying it
   * to a browsing surface would make this page disagree with the entry list.
   *
   * A member's totals cover only their own hours, exactly like their reports (D3).
   */
  .get(
    "/stats",
    zValidator("query", z.object({ since: z.string(), until: z.string() })),
    async (c) => {
      const workspaceId = c.get("workspaceId");
      const userId = c.get("userId");
      const { since, until } = c.req.valid("query");
      const scopeUserId = entryScopeUserId(await getMemberRole(c.env.DB, workspaceId, userId), userId);
      const { where, bindings } = buildReportWhere({ workspaceId, since, until, scopeUserId });

      const { results } = await c.env.DB.prepare(
        `
      SELECT
        p.client_id                                   AS client_id,
        SUM(te.duration)                              AS total_seconds,
        SUM(CASE WHEN te.billable = 1 THEN te.duration ELSE 0 END) AS billable_seconds,
        SUM((CASE WHEN te.billable = 1 THEN te.duration ELSE 0 END)
            * COALESCE(p.rate, 0) / 3600.0)           AS billable_amount,
        COUNT(DISTINCT te.project_id)                 AS project_count,
        MAX(te.start)                                 AS last_tracked
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      WHERE ${where} AND p.client_id IS NOT NULL
      GROUP BY p.client_id
    `
      )
        .bind(...bindings)
        .all<Record<string, unknown>>();

      return c.json(
        results.map((r) => ({
          clientId: r.client_id as string,
          totalSeconds: (r.total_seconds as number) ?? 0,
          billableSeconds: (r.billable_seconds as number) ?? 0,
          billableAmount: (r.billable_amount as number) ?? 0,
          projectCount: (r.project_count as number) ?? 0,
          lastTracked: (r.last_tracked as string | null) ?? null,
        }))
      );
    }
  )
  .get("/:id", async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM clients WHERE id = ? AND workspace_id = ?`
    )
      .bind(c.req.param("id"), c.get("workspaceId"))
      .all<Record<string, unknown>>();

    if (!results.length) return c.json({ error: "Not found" }, 404);
    return c.json(formatClient(results[0]));
  })
  .put("/:id", zValidator("json", UpdateClientSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const id = c.req.param("id");
    const data = c.req.valid("json");

    if (!canManageWorkspace(await getMemberRole(c.env.DB, workspaceId, c.get("userId")))) {
      return c.json({ error: MANAGER_ONLY_ERROR }, 403);
    }

    const fields: string[] = [];
    const values: unknown[] = [];

    if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
    if (data.notes !== undefined) { fields.push("notes = ?"); values.push(data.notes ?? null); }
    if (data.email !== undefined) { fields.push("email = ?"); values.push(data.email ?? null); }
    if (data.phone !== undefined) { fields.push("phone = ?"); values.push(data.phone ?? null); }
    if (data.address !== undefined) { fields.push("address = ?"); values.push(data.address ?? null); }
    if (data.archived !== undefined) { fields.push("archived = ?"); values.push(data.archived ? 1 : 0); }

    if (fields.length) {
      await c.env.DB.prepare(
        `UPDATE clients SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`
      )
        .bind(...values, id, workspaceId)
        .run();
    }

    const { results } = await c.env.DB.prepare(
      `SELECT * FROM clients WHERE id = ? AND workspace_id = ?`
    )
      .bind(id, workspaceId)
      .all<Record<string, unknown>>();

    if (!results.length) return c.json({ error: "Not found" }, 404);
    return c.json(formatClient(results[0]));
  })
  .delete("/:id", async (c) => {
    const workspaceId = c.get("workspaceId");
    if (!canManageWorkspace(await getMemberRole(c.env.DB, workspaceId, c.get("userId")))) {
      return c.json({ error: MANAGER_ONLY_ERROR }, 403);
    }
    await c.env.DB.prepare(
      `UPDATE clients SET archived = 1 WHERE id = ? AND workspace_id = ?`
    )
      .bind(c.req.param("id"), workspaceId)
      .run();
    return c.json({ ok: true });
  });
