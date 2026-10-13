import { describe, expect, it, vi } from "vitest";
import { createMigratedD1 } from "../../../test/sqlite-d1";
import type { ToolRegistrar } from "../shared";

// The registry pulls in tasks.ts → lib/image.ts, which loads a real WASM module outside vitest.
vi.mock("@cf-wasm/photon/workerd", () => ({ PhotonImage: class {}, SamplingFilter: { Lanczos3: 1 }, resize: vi.fn() }));

const { registerAllTools } = await import("../registry");

type ToolResult = { content: { type: string; text: string }[]; isError?: boolean };
type Handler = (args: Record<string, unknown>) => Promise<ToolResult>;

/** A workspace whose client has 8h15 of September time, two services (one not billable) and no rate of its own. */
function world() {
  const { db, raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  raw.exec(`
    INSERT INTO workspaces (id, name, default_rate) VALUES ('ws-A', 'Agency', 65);
    INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES
      ('u-owner', 'Ada', 'ada@x.test', '${now}', '${now}'), ('u-member', 'Mel', 'mel@x.test', '${now}', '${now}');
    UPDATE "user" SET currency = 'BRL' WHERE id = 'u-owner';
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES
      ('m-owner', 'ws-A', 'u-owner', 'owner', '${now}'), ('m-member', 'ws-A', 'u-member', 'member', '${now}');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl-A', 'ws-A', 'School');
    INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p1', 'ws-A', 'Site', 'cl-A');
    INSERT INTO time_entries (id, workspace_id, project_id, user_id, start, stop, duration) VALUES
      ('e1', 'ws-A', 'p1', 'u-owner', '2026-09-02T12:00:00.000Z', '2026-09-02T18:00:00.000Z', 21600),
      ('e2', 'ws-A', 'p1', 'u-member', '2026-09-15T12:00:00.000Z', '2026-09-15T14:15:00.000Z', 8100),
      ('e3', 'ws-A', 'p1', 'u-owner', '2026-10-01T12:00:00.000Z', '2026-10-01T13:00:00.000Z', 3600);
    INSERT INTO client_services (id, workspace_id, client_id, name, amount, billable) VALUES
      ('s1', 'ws-A', 'cl-A', 'Email server', 35, 1), ('s2', 'ws-A', 'cl-A', 'Internal', 999, 0);
  `);
  const env = { DB: db, APP_URL: "https://app.test", TIMER_ROOM: { idFromName: () => "r", get: () => ({ fetch: async () => new Response(null) }) } } as unknown as Env;
  const executionCtx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
  const toolsFor = (userId: string) => {
    const tools = new Map<string, Handler>();
    const registrar = { registerTool: (name: string, _c: unknown, h: Handler) => tools.set(name, h) } as unknown as ToolRegistrar;
    registerAllTools(registrar, { env, workspaceId: "ws-A", userId, scope: "read_write", role: userId === "u-owner" ? "owner" : "member", executionCtx });
    return tools;
  };
  const call = async (tools: Map<string, Handler>, name: string, args: Record<string, unknown> = {}) => {
    const result = await tools.get(name)!(args);
    const body = result.content[0]?.text ?? "";
    return result.isError ? { error: body, data: null } : { error: null, data: JSON.parse(body) as Record<string, unknown> };
  };
  return { toolsFor, call, raw };
}

const SEPTEMBER = { clientId: "cl-A", since: "2026-09-01", until: "2026-09-30", language: "pt-BR", timezoneOffsetMinutes: 180 };

describe("prepare_client_document", () => {
  it("prices the invoice like the PDF and links to the filled-in generator", async () => {
    const { toolsFor, call } = world();
    const { data } = await call(toolsFor("u-owner"), "prepare_client_document", { ...SEPTEMBER, kind: "invoice" });
    expect(data).toMatchObject({
      client: "School",
      hours: 8.25,
      entryCount: 2,
      invoiceNumber: "2026-09",
      currency: "BRL",
      hourlyRate: 65,
      rateSource: "workspace default",
      lines: [
        { description: "Serviços Técnicos", hours: 8.25, amount: 536.25 },
        { description: "Email server", hours: null, amount: 35 },
      ],
      total: 571.25,
      url: "https://app.test/clients/cl-A?document=invoice&from=2026-09-01&to=2026-09-30&lang=pt-BR&number=2026-09",
    });
  });

  it("bills at the client's own rate when it has one", async () => {
    const { toolsFor, call, raw } = world();
    raw.exec(`UPDATE clients SET rate = 100 WHERE id = 'cl-A'`);
    const { data } = await call(toolsFor("u-owner"), "prepare_client_document", { ...SEPTEMBER, kind: "invoice", language: "en" });
    expect(data).toMatchObject({ hourlyRate: 100, rateSource: "client", total: 860 });
  });

  it("bills a one-off rate without saving it, and carries it in the link", async () => {
    const { toolsFor, call, raw } = world();
    const { data } = await call(toolsFor("u-owner"), "prepare_client_document", { ...SEPTEMBER, kind: "invoice", hourlyRate: 120 });
    expect(data).toMatchObject({ hourlyRate: 120, rateSource: "this invoice only", total: 1025 });
    expect(data?.url).toMatch(/&rate=120$/);
    expect(raw.prepare(`SELECT rate FROM clients WHERE id = 'cl-A'`).get()).toEqual({ rate: null });
  });

  it("summarises the hours report without money", async () => {
    const { toolsFor, call } = world();
    const { data } = await call(toolsFor("u-owner"), "prepare_client_document", { ...SEPTEMBER, kind: "hours" });
    expect(data).toMatchObject({ hours: 8.25, entryCount: 2, dailyAverageHours: 4.13 });
    expect(data).not.toHaveProperty("total");
    expect(data?.url).toBe("https://app.test/clients/cl-A?document=hours&from=2026-09-01&to=2026-09-30&lang=pt-BR");
  });

  it("refuses a backwards period and an unknown client", async () => {
    const { toolsFor, call } = world();
    const tools = toolsFor("u-owner");
    expect((await call(tools, "prepare_client_document", { ...SEPTEMBER, kind: "hours", since: "2026-09-30", until: "2026-09-01" })).error).toMatch(/after/);
    expect((await call(tools, "prepare_client_document", { ...SEPTEMBER, kind: "hours", clientId: "nope" })).error).toMatch(/list_clients/);
  });

  it("is not offered to a member, whose reports would only hold their own hours", () => {
    const { toolsFor } = world();
    const tools = toolsFor("u-member");
    expect(tools.has("prepare_client_document")).toBe(false);
    expect(tools.has("add_client_service")).toBe(false);
    expect(tools.has("list_client_services")).toBe(true);
  });
});

describe("billing through MCP", () => {
  it("sets a client's rate and manages its services", async () => {
    const { toolsFor, call, raw } = world();
    const tools = toolsFor("u-owner");
    expect((await call(tools, "update_client", { clientId: "cl-A", rate: 80 })).data).toMatchObject({ rate: 80 });
    const added = (await call(tools, "add_client_service", { clientId: "cl-A", name: "Hosting", amount: 50 })).data as { id: string };
    await call(tools, "update_client_service", { clientId: "cl-A", serviceId: added.id, billable: false });
    expect(raw.prepare(`SELECT billable FROM client_services WHERE id = ?`).get(added.id)).toEqual({ billable: 0 });
    await call(tools, "delete_client_service", { clientId: "cl-A", serviceId: added.id });
    const list = (await call(tools, "list_client_services", { clientId: "cl-A" })).data as unknown as { name: string }[];
    expect(list.map((s) => s.name)).toEqual(["Email server", "Internal"]);
  });

  it("reads and edits the document settings", async () => {
    const { toolsFor, call } = world();
    const tools = toolsFor("u-owner");
    expect((await call(tools, "get_report_settings")).data).toMatchObject({ companyName: "Agency", companyEmail: "ada@x.test", currency: "BRL", defaultRate: 65, hasLogo: false });
    expect((await call(tools, "update_report_settings", { defaultRate: 90, currency: "USD" })).data).toMatchObject({ defaultRate: 90, currency: "USD" });
  });
});
