import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  CreateInvoiceSchema,
  UpdateInvoiceSchema,
  type Invoice,
  type InvoiceParty,
} from "@shared/schemas";
import { invoiceTotal } from "@shared/client-documents";
import { isManager, MANAGER_ONLY_ERROR } from "../lib/permissions";
import { loadReportSettings } from "./report-settings";

interface InvoiceRow {
  id: string;
  client_id: string;
  number: string;
  issue_date: string;
  due_date: string;
  period_from: string;
  period_to: string;
  currency: string;
  locale: "pt-BR" | "en";
  lines: string;
  total: number;
  notes: string | null;
  client_snapshot: string;
  company_snapshot: string;
  created_at: string;
  updated_at: string;
}

function formatInvoice(r: InvoiceRow): Invoice {
  return {
    id: r.id,
    clientId: r.client_id,
    number: r.number,
    issueDate: r.issue_date,
    dueDate: r.due_date,
    periodFrom: r.period_from,
    periodTo: r.period_to,
    currency: r.currency,
    locale: r.locale,
    lines: JSON.parse(r.lines),
    total: r.total,
    notes: r.notes,
    client: JSON.parse(r.client_snapshot),
    company: JSON.parse(r.company_snapshot),
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** The client's and the company's details as they are now, frozen into an invoice when it is saved; null when the client isn't in the workspace. */
async function currentParties(db: D1Database, workspaceId: string, clientId: string): Promise<{ client: InvoiceParty; company: InvoiceParty } | null> {
  const [client, settings] = await Promise.all([
    db.prepare(`SELECT name, email, address, phone FROM clients WHERE id = ? AND workspace_id = ?`)
      .bind(clientId, workspaceId)
      .first<InvoiceParty>(),
    loadReportSettings(db, workspaceId),
  ]);
  if (!client) return null;
  return {
    client: { name: client.name, email: client.email, address: client.address, phone: client.phone },
    company: {
      name: settings.companyName,
      email: settings.companyEmail || null,
      address: settings.companyAddress || null,
      phone: settings.companyPhone || null,
    },
  };
}

/** Whole days from issue to due date, kept inside the 0–365 the settings accept. */
function dueDaysOf(issue: string, due: string): number {
  const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${issue}T00:00:00Z`)) / 86_400_000);
  return Math.min(365, Math.max(0, days));
}

// Invoices carry money, so every route, reads included, is for owners/admins only — the same rule as generating one.
export const invoicesRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  .use(async (c, next) => {
    if (!(await isManager(c.env.DB, c.get("workspaceId"), c.get("userId")))) return c.json({ error: MANAGER_ONLY_ERROR }, 403);
    await next();
  })
  .get("/", async (c) => {
    const clientId = c.req.query("clientId");
    const { results } = await c.env.DB.prepare(
      `SELECT * FROM invoices WHERE workspace_id = ? ${clientId ? "AND client_id = ?" : ""}
       ORDER BY issue_date DESC, created_at DESC`
    )
      .bind(c.get("workspaceId"), ...(clientId ? [clientId] : []))
      .all<InvoiceRow>();
    return c.json(results.map(formatInvoice), 200);
  })
  .get("/:id", async (c) => {
    const row = await c.env.DB.prepare(`SELECT * FROM invoices WHERE id = ? AND workspace_id = ?`)
      .bind(c.req.param("id"), c.get("workspaceId"))
      .first<InvoiceRow>();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(formatInvoice(row), 200);
  })
  .post("/", zValidator("json", CreateInvoiceSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const data = c.req.valid("json");
    const parties = await currentParties(c.env.DB, workspaceId, data.clientId);
    if (!parties) return c.json({ error: "Not found" }, 404);
    const now = new Date().toISOString();
    const dueDays = dueDaysOf(data.issueDate, data.dueDate);

    const id = crypto.randomUUID();
    await c.env.DB.batch([
      c.env.DB.prepare(
        `INSERT INTO invoices (id, workspace_id, client_id, number, issue_date, due_date, period_from, period_to,
           currency, locale, lines, total, notes, client_snapshot, company_snapshot, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        id, workspaceId, data.clientId, data.number, data.issueDate, data.dueDate,
        data.periodFrom, data.periodTo, data.currency, data.locale, JSON.stringify(data.lines),
        invoiceTotal(data.lines), data.notes || null, JSON.stringify(parties.client),
        JSON.stringify(parties.company), now, now
      ),
      // The number and due-days of the invoice just saved are what the next one is offered.
      c.env.DB.prepare(
        `INSERT INTO report_settings (workspace_id, last_invoice_number, invoice_due_days) VALUES (?, ?, ?)
         ON CONFLICT(workspace_id) DO UPDATE SET last_invoice_number = excluded.last_invoice_number,
           invoice_due_days = excluded.invoice_due_days`
      ).bind(workspaceId, data.number, dueDays),
    ]);
    const created = await c.env.DB.prepare(`SELECT * FROM invoices WHERE id = ?`).bind(id).first<InvoiceRow>();
    if (!created) throw new Error("invoice insert did not produce a readable row");
    return c.json(formatInvoice(created), 201);
  })
  .put("/:id", zValidator("json", UpdateInvoiceSchema), async (c) => {
    const workspaceId = c.get("workspaceId");
    const id = c.req.param("id");
    const data = c.req.valid("json");
    const existing = await c.env.DB.prepare(`SELECT client_id FROM invoices WHERE id = ? AND workspace_id = ?`)
      .bind(id, workspaceId)
      .first<{ client_id: string }>();
    if (!existing) return c.json({ error: "Not found" }, 404);
    // Saving an edit takes the client's and the company's details as they are now; an invoice nobody edits keeps its own.
    const parties = await currentParties(c.env.DB, workspaceId, existing.client_id);
    const columns: Record<string, unknown> = {
      client_snapshot: parties && JSON.stringify(parties.client),
      company_snapshot: parties && JSON.stringify(parties.company),
      number: data.number,
      issue_date: data.issueDate,
      due_date: data.dueDate,
      period_from: data.periodFrom,
      period_to: data.periodTo,
      currency: data.currency,
      locale: data.locale,
      lines: data.lines && JSON.stringify(data.lines),
      total: data.lines && invoiceTotal(data.lines),
      notes: data.notes === undefined ? undefined : data.notes || null,
    };
    const set = Object.entries(columns).filter(([, v]) => v !== undefined);
    if (set.length) {
      const { meta } = await c.env.DB.prepare(
        `UPDATE invoices SET ${set.map(([k]) => `${k} = ?`).join(", ")}, updated_at = ? WHERE id = ? AND workspace_id = ?`
      )
        .bind(...set.map(([, v]) => v), new Date().toISOString(), id, workspaceId)
        .run();
      // A payment term changed on an edit is the next invoice's default too, as on a new one.
      if (meta.changes && data.issueDate && data.dueDate) {
        await c.env.DB.prepare(
          `INSERT INTO report_settings (workspace_id, invoice_due_days) VALUES (?, ?)
           ON CONFLICT(workspace_id) DO UPDATE SET invoice_due_days = excluded.invoice_due_days`
        ).bind(workspaceId, dueDaysOf(data.issueDate, data.dueDate)).run();
      }
    }
    const row = await c.env.DB.prepare(`SELECT * FROM invoices WHERE id = ? AND workspace_id = ?`)
      .bind(id, workspaceId)
      .first<InvoiceRow>();
    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(formatInvoice(row), 200);
  })
  .delete("/:id", async (c) => {
    await c.env.DB.prepare(`DELETE FROM invoices WHERE id = ? AND workspace_id = ?`)
      .bind(c.req.param("id"), c.get("workspaceId"))
      .run();
    return c.json({ ok: true }, 200);
  });
