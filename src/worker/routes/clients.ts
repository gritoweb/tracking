import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  CreateClientSchema,
  CreateClientServiceSchema,
  UpdateClientSchema,
  UpdateClientServiceSchema,
  type ClientService,
  type ClientStats,
} from "@shared/schemas";
import { buildReportWhere } from "../db/queries";
import type { ClientRow, ClientServiceRow } from "../db/rows";
import { createClient, formatClient } from "../lib/clients";
import { DEFAULT_HOURLY_RATE } from "./report-settings";
import {
  canManageWorkspace,
  entryScopeUserId,
  getMemberRole,
  MANAGER_ONLY_ERROR,
} from "../lib/permissions";

function formatService(r: ClientServiceRow): ClientService {
  return {
    id: r.id,
    clientId: r.client_id,
    name: r.name,
    description: r.description ?? null,
    amount: r.amount,
    billable: Boolean(r.billable),
    createdAt: r.created_at,
  };
}

/** `GET /stats`'s own aggregation — one row per client_id, over the report's date window. */
interface ClientStatsRow {
  client_id: string;
  total_seconds: number | null;
  billable_seconds: number | null;
  billable_amount: number | null;
  project_count: number | null;
  last_tracked: string | null;
}

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
      .all<ClientRow>();

    return c.json(results.map(formatClient), 200);
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
   * Same filter as the reports (`buildReportWhere`), but the amount is billable
   * hours × the invoice's rate (the client's, else the workspace default), so it
   * agrees with what the client is invoiced, not with project rates.
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
            * COALESCE(c.rate, w.default_rate, ${DEFAULT_HOURLY_RATE}) / 3600.0) AS billable_amount,
        COUNT(DISTINCT te.project_id)                 AS project_count,
        MAX(te.start)                                 AS last_tracked
      FROM time_entries te
      LEFT JOIN projects p ON p.id = te.project_id
      LEFT JOIN clients c ON c.id = p.client_id
      LEFT JOIN workspaces w ON w.id = c.workspace_id
      WHERE ${where} AND p.client_id IS NOT NULL
      GROUP BY p.client_id
    `
      )
        .bind(...bindings)
        .all<ClientStatsRow>();

      return c.json(
        results.map(
          (r): ClientStats => ({
            clientId: r.client_id,
            totalSeconds: r.total_seconds ?? 0,
            billableSeconds: r.billable_seconds ?? 0,
            billableAmount: r.billable_amount ?? 0,
            projectCount: r.project_count ?? 0,
            lastTracked: r.last_tracked ?? null,
          })
        ),
        200
      );
    }
  )
  .get("/:id", async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM clients WHERE id = ? AND workspace_id = ?`
    )
      .bind(c.req.param("id"), c.get("workspaceId"))
      .all<ClientRow>();

    if (!results.length) return c.json({ error: "Not found" }, 404);
    return c.json(formatClient(results[0]), 200);
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
    if (data.rate !== undefined) { fields.push("rate = ?"); values.push(data.rate ?? null); }

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
      .all<ClientRow>();

    if (!results.length) return c.json({ error: "Not found" }, 404);
    return c.json(formatClient(results[0]), 200);
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
    return c.json({ ok: true }, 200);
  })
  // Fixed services: anyone in the workspace reads them, only owners/admins change them.
  .get("/:id/services", async (c) => {
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM client_services WHERE client_id = ? AND workspace_id = ? ORDER BY created_at ASC, name ASC`
    )
      .bind(c.req.param("id"), c.get("workspaceId"))
      .all<ClientServiceRow>();
    return c.json(results.map(formatService), 200);
  })
  .post("/:id/services", zValidator("json", CreateClientServiceSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const clientId = c.req.param("id");
    if (!canManageWorkspace(await getMemberRole(c.env.DB, workspaceId, c.get("userId")))) {
      return c.json({ error: MANAGER_ONLY_ERROR }, 403);
    }
    const client = await c.env.DB.prepare(`SELECT 1 FROM clients WHERE id = ? AND workspace_id = ?`)
      .bind(clientId, workspaceId)
      .first();
    if (!client) return c.json({ error: "Not found" }, 404);

    const data = c.req.valid("json");
    const row = await c.env.DB.prepare(
      `INSERT INTO client_services (id, workspace_id, client_id, name, description, amount, billable, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
      .bind(
        crypto.randomUUID(),
        workspaceId,
        clientId,
        data.name,
        data.description ?? null,
        data.amount,
        data.billable === false ? 0 : 1,
        new Date().toISOString()
      )
      .first<ClientServiceRow>();
    if (!row) throw new Error("client service insert did not produce a readable row");
    return c.json(formatService(row), 201);
  })
  .put("/:id/services/:serviceId", zValidator("json", UpdateClientServiceSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    if (!canManageWorkspace(await getMemberRole(c.env.DB, workspaceId, c.get("userId")))) {
      return c.json({ error: MANAGER_ONLY_ERROR }, 403);
    }
    const data = c.req.valid("json");
    const fields: string[] = [];
    const values: unknown[] = [];
    if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
    if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description ?? null); }
    if (data.amount !== undefined) { fields.push("amount = ?"); values.push(data.amount); }
    if (data.billable !== undefined) { fields.push("billable = ?"); values.push(data.billable ? 1 : 0); }

    const where = `id = ? AND client_id = ? AND workspace_id = ?`;
    const keys = [c.req.param("serviceId"), c.req.param("id"), workspaceId];
    if (fields.length) {
      await c.env.DB.prepare(`UPDATE client_services SET ${fields.join(", ")} WHERE ${where}`)
        .bind(...values, ...keys)
        .run();
    }
    const row = await c.env.DB.prepare(`SELECT * FROM client_services WHERE ${where}`)
      .bind(...keys)
      .first<ClientServiceRow>();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(formatService(row), 200);
  })
  .delete("/:id/services/:serviceId", async (c) => {
    const workspaceId = c.get("workspaceId");
    if (!canManageWorkspace(await getMemberRole(c.env.DB, workspaceId, c.get("userId")))) {
      return c.json({ error: MANAGER_ONLY_ERROR }, 403);
    }
    await c.env.DB.prepare(`DELETE FROM client_services WHERE id = ? AND client_id = ? AND workspace_id = ?`)
      .bind(c.req.param("serviceId"), c.req.param("id"), workspaceId)
      .run();
    return c.json({ ok: true }, 200);
  });
