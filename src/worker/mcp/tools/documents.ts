// Client documents (invoice, worked-hours report): a client's fixed services, the branding, and preparing a document.
import { z } from "zod";
import {
  CreateClientServiceSchema,
  UpdateClientServiceSchema,
  UpdateReportSettingsSchema,
  type Client,
  type ClientService,
  type ReportDetailedEntry,
  type ReportSettings,
  type Settings,
} from "@shared/schemas";
import { hoursSummary, invoiceLines, invoiceTotal } from "@shared/client-documents";
import { appUrl } from "../../lib/app-url";
import { InvoiceNumberSchema } from "../../routes/report-settings";
import { segment } from "../rest-bridge";
import { DESTRUCTIVE, DateArg, IdArg, MUTATES, hours, READ_ONLY, TimezoneArg, fromBridge, json, rangeToIso, refuse, type ToolDeps } from "../shared";

export function registerDocumentReads(d: ToolDeps): void {
  const { server, env, bridge } = d;

  server.registerTool(
    "list_client_services",
    {
      title: "List a client's fixed services",
      description: "A client's fixed services (hosting, email…): name, description, amount and whether it is billable. Only billable ones go on the client's invoice.",
      inputSchema: { clientId: IdArg("client") },
      annotations: READ_ONLY,
    },
    async ({ clientId }) => fromBridge(await bridge("GET", `/api/clients/${segment(clientId)}/services`))
  );

  server.registerTool(
    "get_report_settings",
    {
      title: "Read the document settings",
      description: "What the client documents use: company name and e-mail, the currency invoices bill in, the default hourly rate (for clients without their own), colours and whether a logo is set.",
      inputSchema: {},
      annotations: READ_ONLY,
    },
    async () =>
      fromBridge(await bridge<ReportSettings>("GET", "/api/report-settings"), ({ logoUrl, ...s }) => ({ ...s, hasLogo: logoUrl !== null }))
  );

  server.registerTool(
    "prepare_client_document",
    {
      title: "Prepare a client document",
      description:
        "Prepare a client's invoice or worked-hours report for a period and get the link that opens it, filled in, in the app — where the person clicks Generate PDF (the PDF is made in their browser, not here). " +
        "Before calling: if the person didn't say which period, propose last month (its first to its last day) and ask them to confirm or give other dates; never pick a period silently. Ask the language too when it isn't clear. " +
        "The answer carries the hours, the invoice lines and total (whole hours rounded down × the client's rate, else the workspace default, plus billable fixed services) so you can tell the person before they open it. Owners/admins only.",
      inputSchema: {
        clientId: IdArg("client"),
        kind: z.enum(["invoice", "hours"]).describe("`invoice`, or `hours` for the worked-hours report"),
        since: DateArg.describe("First day of the period (inclusive), YYYY-MM-DD"),
        until: DateArg.describe("Last day of the period (inclusive), YYYY-MM-DD"),
        language: z.enum(["pt-BR", "en"]).describe("Language of the document"),
        invoiceNumber: InvoiceNumberSchema.optional().describe("Invoice only: digits and hyphens (12, 2026-09); defaults to the workspace's next number, the one after the last generated, in its pattern"),
        hourlyRate: z.number().min(0).max(1_000_000).optional().describe("Invoice only: a new hourly rate the person asked for. It prices this answer and is saved as the client's rate when they generate the PDF from the link. Omit to use the client's rate, else the workspace default"),
        timezoneOffsetMinutes: TimezoneArg,
      },
      annotations: READ_ONLY,
    },
    async ({ clientId, kind, since, until, language, invoiceNumber, hourlyRate, timezoneOffsetMinutes }) => {
      if (since > until) return refuse("`since` is after `until`.");
      const [client, settings, prefs] = await Promise.all([
        bridge<Client>("GET", `/api/clients/${segment(clientId)}`),
        bridge<ReportSettings>("GET", "/api/report-settings"),
        bridge<Settings>("GET", "/api/settings"),
      ]);
      if (!client.ok) return refuse(`${client.error}. Get the clientId from list_clients.`);
      if (!settings.ok) return refuse(settings.error);
      if (!prefs.ok) return refuse(prefs.error);

      // The same entries, rounding and money the app's PDF will use.
      const { sinceIso, untilIso } = rangeToIso(since, until, timezoneOffsetMinutes);
      const query = new URLSearchParams({ since: sinceIso, until: untilIso, clientIds: clientId });
      if (prefs.data.roundMode !== "off" && prefs.data.roundMinutes > 0) {
        query.set("roundMode", prefs.data.roundMode);
        query.set("roundMinutes", String(prefs.data.roundMinutes));
      }
      const [entries, services] = await Promise.all([
        bridge<ReportDetailedEntry[]>("GET", `/api/reports/detailed?${query}`),
        kind === "invoice" ? bridge<ClientService[]>("GET", `/api/clients/${segment(clientId)}/services`) : null,
      ]);
      if (!entries.ok) return refuse(entries.error);
      if (services && !services.ok) return refuse(services.error);

      const number = invoiceNumber ?? settings.data.nextInvoiceNumber;
      const link = new URLSearchParams({ document: kind, from: since, to: until, lang: language });
      if (kind === "invoice") link.set("number", number);
      if (kind === "invoice" && hourlyRate !== undefined) link.set("rate", String(hourlyRate));
      const localDay = (iso: string) => new Date(Date.parse(iso) - timezoneOffsetMinutes * 60_000).toISOString().slice(0, 10);
      const summary = hoursSummary(entries.data, localDay);
      const common = {
        client: client.data.name,
        kind,
        period: { since, until },
        language,
        hours: hours(summary.totalSeconds),
        entryCount: summary.entryCount,
        url: `${appUrl(env)}/clients/${segment(clientId)}?${link}`,
      };

      if (kind === "hours") return json({ ...common, dailyAverageHours: hours(summary.dailyAverageHours * 3600) });
      const rate = hourlyRate ?? client.data.rate ?? settings.data.defaultRate;
      const lines = invoiceLines(summary.totalSeconds, rate, services?.ok ? services.data : [], language);
      return json({
        ...common,
        invoiceNumber: number,
        currency: settings.data.currency,
        hourlyRate: rate,
        rateSource: hourlyRate !== undefined ? "new rate, saved on the client when generated" : client.data.rate === null ? "workspace default" : "client",
        lines: lines.map((l) => ({ ...l, hours: l.hours === null ? null : hours(l.hours * 3600) })),
        total: invoiceTotal(lines),
      });
    }
  );
}

export function registerDocumentWrites(d: ToolDeps): void {
  const { server, bridge } = d;

  server.registerTool(
    "add_client_service",
    {
      title: "Add a fixed service to a client",
      description: "Add a fixed service (hosting, email…) to a client. Billable unless `billable: false`; billable ones go on the client's invoice. Owners/admins only.",
      inputSchema: { clientId: IdArg("client"), ...CreateClientServiceSchema.shape },
      annotations: MUTATES,
    },
    async ({ clientId, ...body }) => fromBridge(await bridge("POST", `/api/clients/${segment(clientId)}/services`, body))
  );

  server.registerTool(
    "update_client_service",
    {
      title: "Edit a client's fixed service",
      description: "Change a fixed service's name, description, amount or billable flag — only the fields passed change. Get the serviceId from list_client_services. Owners/admins only.",
      inputSchema: { clientId: IdArg("client"), serviceId: IdArg("service"), ...UpdateClientServiceSchema.shape },
      annotations: { ...MUTATES, idempotentHint: true },
    },
    async ({ clientId, serviceId, ...body }) =>
      fromBridge(await bridge("PUT", `/api/clients/${segment(clientId)}/services/${segment(serviceId)}`, body))
  );

  server.registerTool(
    "delete_client_service",
    {
      title: "Remove a client's fixed service",
      description: "Remove a fixed service from a client. Confirm with the person first. Owners/admins only.",
      inputSchema: { clientId: IdArg("client"), serviceId: IdArg("service") },
      annotations: DESTRUCTIVE,
    },
    async ({ clientId, serviceId }) =>
      fromBridge(await bridge("DELETE", `/api/clients/${segment(clientId)}/services/${segment(serviceId)}`))
  );

  server.registerTool(
    "update_report_settings",
    {
      title: "Edit the document settings",
      description: "Change what the client documents use: company name and e-mail, the currency invoices bill in, the default hourly rate, or the three colours (#rrggbb) — only the fields passed change. The logo is uploaded in the app. Owners/admins only.",
      inputSchema: UpdateReportSettingsSchema.shape,
      annotations: { ...MUTATES, idempotentHint: true },
    },
    async (body) =>
      fromBridge(await bridge<ReportSettings>("PUT", "/api/report-settings", body), ({ logoUrl, ...s }) => ({ ...s, hasLogo: logoUrl !== null }))
  );
}
