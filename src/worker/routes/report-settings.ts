import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  UpdateReportSettingsSchema,
  type ReportSettings,
} from "@shared/schemas";
import { REPORT_DEFAULT_COLORS } from "@shared/colors";
import { INVOICE_NUMBER } from "@shared/client-documents";
import { isManager, MANAGER_ONLY_ERROR } from "../lib/permissions";

const MAX_LOGO_BYTES = 1024 * 1024;
export const InvoiceNumberSchema = z.string().trim().regex(INVOICE_NUMBER, "Digits and hyphens only, e.g. 12 or 2026-09");
// The one default not taken from the workspace itself: an invoice always needs some rate.
export const DEFAULT_HOURLY_RATE = 100;

// Sniffed from the bytes; the PDF renderer embeds only PNG and JPEG (lib/image.ts is not imported: it pulls in the photon wasm).
function logoContentType(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  return null;
}

interface ReportSettingsRow {
  company_name: string | null;
  company_email: string | null;
  color_primary: string | null;
  color_accent: string | null;
  color_text: string | null;
  logo_r2_key: string | null;
  logo_content_type: string | null;
  currency: string | null;
  last_invoice_number: string | null;
  updated_at: string;
}

async function load(db: D1Database, workspaceId: string): Promise<ReportSettings> {
  // Unsaved fields come from the workspace: its name, and its first owner's e-mail and display currency.
  const [row, ws] = await Promise.all([
    db.prepare(`SELECT * FROM report_settings WHERE workspace_id = ?`).bind(workspaceId).first<ReportSettingsRow>(),
    db.prepare(
      `SELECT w.name, w.default_rate, u.email AS owner_email, u.currency AS owner_currency
       FROM workspaces w
       LEFT JOIN "member" m ON m.organizationId = w.id AND m.role = 'owner'
       LEFT JOIN "user" u ON u.id = m.userId
       WHERE w.id = ?
       ORDER BY m.createdAt ASC LIMIT 1`
    ).bind(workspaceId)
      .first<{ name: string; default_rate: number | null; owner_email: string | null; owner_currency: string | null }>(),
  ]);
  return {
    companyName: row?.company_name || ws?.name || "",
    companyEmail: row?.company_email || ws?.owner_email || "",
    colors: {
      primary: row?.color_primary ?? REPORT_DEFAULT_COLORS.primary,
      accent: row?.color_accent ?? REPORT_DEFAULT_COLORS.accent,
      text: row?.color_text ?? REPORT_DEFAULT_COLORS.text,
    },
    logoUrl: row?.logo_r2_key ? `/api/report-settings/logo?v=${encodeURIComponent(row.updated_at)}` : null,
    defaultRate: ws?.default_rate ?? DEFAULT_HOURLY_RATE,
    currency: row?.currency ?? ws?.owner_currency ?? "USD",
    invoiceNumber: row?.last_invoice_number ?? "1",
  };
}

// Every member reads the branding (it renders their PDFs); only owners/admins change it.
export const reportSettingsRouter = new Hono<{
  Bindings: Env;
  Variables: { workspaceId: string; userId: string };
}>()
  .get("/", async (c) => c.json(await load(c.env.DB, c.get("workspaceId")), 200))
  .put("/", zValidator("json", UpdateReportSettingsSchema), async (c) => {
    if (!(await isManager(c.env.DB, c.get("workspaceId"), c.get("userId")))) return c.json({ error: MANAGER_ONLY_ERROR }, 403);
    const workspaceId = c.get("workspaceId");
    const data = c.req.valid("json");

    const fields: string[] = [];
    const values: unknown[] = [];
    if (data.companyName !== undefined) { fields.push("company_name"); values.push(data.companyName || null); }
    if (data.companyEmail !== undefined) { fields.push("company_email"); values.push(data.companyEmail || null); }
    if (data.currency !== undefined) { fields.push("currency"); values.push(data.currency); }
    if (data.colors) {
      fields.push("color_primary", "color_accent", "color_text");
      values.push(data.colors.primary.toLowerCase(), data.colors.accent.toLowerCase(), data.colors.text.toLowerCase());
    }

    const writes: D1PreparedStatement[] = [];
    if (fields.length) {
      writes.push(
        c.env.DB.prepare(
          `INSERT INTO report_settings (workspace_id, ${fields.join(", ")}, updated_at)
           VALUES (?, ${fields.map(() => "?").join(", ")}, ?)
           ON CONFLICT(workspace_id) DO UPDATE SET ${fields.map((f) => `${f} = excluded.${f}`).join(", ")}, updated_at = excluded.updated_at`
        ).bind(workspaceId, ...values, new Date().toISOString())
      );
    }
    if (data.defaultRate !== undefined) {
      writes.push(c.env.DB.prepare(`UPDATE workspaces SET default_rate = ? WHERE id = ?`).bind(data.defaultRate, workspaceId));
    }
    if (writes.length) await c.env.DB.batch(writes);
    return c.json(await load(c.env.DB, workspaceId), 200);
  })
  // The number an invoice was generated with is the one the next invoice is offered.
  .post("/invoice-number", zValidator("json", z.object({ number: InvoiceNumberSchema })), async (c) => {
    if (!(await isManager(c.env.DB, c.get("workspaceId"), c.get("userId")))) return c.json({ error: MANAGER_ONLY_ERROR }, 403);
    const workspaceId = c.get("workspaceId");
    await c.env.DB.prepare(
      `INSERT INTO report_settings (workspace_id, last_invoice_number) VALUES (?, ?)
       ON CONFLICT(workspace_id) DO UPDATE SET last_invoice_number = excluded.last_invoice_number`
    ).bind(workspaceId, c.req.valid("json").number).run();
    return c.json(await load(c.env.DB, workspaceId), 200);
  })
  .put("/logo", async (c) => {
    if (!(await isManager(c.env.DB, c.get("workspaceId"), c.get("userId")))) return c.json({ error: MANAGER_ONLY_ERROR }, 403);
    const workspaceId = c.get("workspaceId");
    // Refuse on the declared size first: parseBody() would buffer the whole upload before any check could run.
    if (Number(c.req.header("content-length")) > MAX_LOGO_BYTES + 16 * 1024) {
      return c.json({ error: "The logo must be at most 1 MB" }, 413);
    }
    const file = (await c.req.parseBody()).file;
    if (!(file instanceof File)) return c.json({ error: "Missing file" }, 400);
    if (file.size > MAX_LOGO_BYTES) return c.json({ error: "The logo must be at most 1 MB" }, 413);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const contentType = logoContentType(bytes);
    if (!contentType) {
      return c.json({ error: "The logo must be a PNG or JPEG image" }, 400);
    }

    const key = `${workspaceId}/report-logo`;
    await c.env.ATTACHMENTS.put(key, bytes, { httpMetadata: { contentType } });
    await c.env.DB.prepare(
      `INSERT INTO report_settings (workspace_id, logo_r2_key, logo_content_type, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(workspace_id) DO UPDATE SET logo_r2_key = excluded.logo_r2_key,
         logo_content_type = excluded.logo_content_type, updated_at = excluded.updated_at`
    ).bind(workspaceId, key, contentType, new Date().toISOString()).run();
    return c.json(await load(c.env.DB, workspaceId), 200);
  })
  .delete("/logo", async (c) => {
    if (!(await isManager(c.env.DB, c.get("workspaceId"), c.get("userId")))) return c.json({ error: MANAGER_ONLY_ERROR }, 403);
    const workspaceId = c.get("workspaceId");
    const row = await c.env.DB.prepare(`SELECT logo_r2_key FROM report_settings WHERE workspace_id = ?`)
      .bind(workspaceId).first<{ logo_r2_key: string | null }>();
    if (row?.logo_r2_key) {
      await c.env.DB.prepare(
        `UPDATE report_settings SET logo_r2_key = NULL, logo_content_type = NULL, updated_at = ? WHERE workspace_id = ?`
      ).bind(new Date().toISOString(), workspaceId).run();
      c.executionCtx.waitUntil(c.env.ATTACHMENTS.delete(row.logo_r2_key));
    }
    return c.json(await load(c.env.DB, workspaceId), 200);
  })
  .get("/logo", async (c) => {
    const row = await c.env.DB.prepare(
      `SELECT logo_r2_key, logo_content_type FROM report_settings WHERE workspace_id = ?`
    ).bind(c.get("workspaceId")).first<{ logo_r2_key: string | null; logo_content_type: string | null }>();
    if (!row?.logo_r2_key) return c.json({ error: "Not found" }, 404);
    const object = await c.env.ATTACHMENTS.get(row.logo_r2_key);
    if (!object) return c.json({ error: "Not found" }, 404);
    return new Response(object.body, {
      headers: {
        "Content-Type": row.logo_content_type ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        // The URL carries a version, so a replaced logo is a new URL.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  });
