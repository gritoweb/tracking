import { describe, expect, it, vi } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import type { ToolRegistrar } from "./shared";
import type { WorkspaceRole } from "../lib/permissions";

// tasks.ts imports lib/image.ts, which loads a real WASM module outside vitest — stub it out (same as the route tests).
vi.mock("@cf-wasm/photon/workerd", () => ({
  PhotonImage: class {},
  SamplingFilter: { Lanczos3: 1 },
  resize: vi.fn(),
}));

const { registerAllTools, MANAGER_ONLY_TOOLS } = await import("./registry");
const { buildChatTools } = await import("./chat-tools");

type Result = { content: { type: string; text: string }[]; isError?: boolean };
type Tool = { config: { inputSchema?: Record<string, unknown> }; handler: (args: Record<string, unknown>) => Promise<Result> };

function world() {
  const { db, raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A');
    INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES
      ('u-admin', 'Ada', 'ada@x.test', '${now}', '${now}'), ('u-member', 'Mel', 'mel@x.test', '${now}', '${now}');
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES
      ('m1', 'ws-A', 'u-admin', 'admin', '${now}'), ('m2', 'ws-A', 'u-member', 'member', '${now}');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl-A', 'ws-A', 'Client');
  `);
  const env = { DB: db, APP_URL: "http://localhost:5173" } as unknown as Env;
  const executionCtx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext;
  const ctx = (role: WorkspaceRole, scope: "read" | "read_write" = "read_write") => ({
    env, workspaceId: "ws-A", userId: role === "member" ? "u-member" : "u-admin", scope, role, executionCtx,
  });
  const toolsFor = (role: WorkspaceRole, scope: "read" | "read_write" = "read_write") => {
    const tools = new Map<string, Tool>();
    const registrar = {
      registerTool: (name: string, config: Tool["config"], handler: Tool["handler"]) => tools.set(name, { config, handler }),
    } as unknown as ToolRegistrar;
    const registered = registerAllTools(registrar, ctx(role, scope));
    return { tools, registered };
  };
  const call = async (tools: Map<string, Tool>, name: string, args: Record<string, unknown> = {}) => {
    const result = await tools.get(name)!.handler(args);
    return result.content[0].text;
  };
  return { raw, ctx, toolsFor, call };
}

describe("what a key is given depends on its owner's role", () => {
  it("never shows a member the tools only owners/admins may use, and shows an admin all of them", () => {
    const w = world();
    const member = [...w.toolsFor("member").tools.keys()];
    const admin = [...w.toolsFor("admin").tools.keys()];
    for (const name of MANAGER_ONLY_TOOLS) {
      expect(member).not.toContain(name);
      expect(admin).toContain(name);
    }
  });

  it("gives a member update_project only to link a client to a project without one", () => {
    const w = world();
    const memberEdit = w.toolsFor("member").tools.get("update_project")!;
    const adminEdit = w.toolsFor("admin").tools.get("update_project")!;
    expect(Object.keys(memberEdit.config.inputSchema!).sort()).toEqual(["clientId", "projectId"]);
    expect(Object.keys(adminEdit.config.inputSchema!)).toContain("rate");
  });

  it("gives a read key no writing tool, whatever the role, but still the guide", () => {
    const w = world();
    const { tools } = w.toolsFor("owner", "read");
    for (const name of ["log_time", "create_task", "update_project", "archive_project", "create_task_status"]) {
      expect(tools.has(name)).toBe(false);
    }
    expect(tools.has("tracking_guide")).toBe(true);
  });

  it("filters the Assistant's tools by the same rule", () => {
    const w = world();
    const memberChat = Object.keys(buildChatTools(w.ctx("member")));
    expect(memberChat).not.toContain("archive_project");
    expect(Object.keys(buildChatTools(w.ctx("admin")))).toContain("archive_project");
  });
});

describe("tracking_guide", () => {
  it("indexes exactly the tools this key was given — a new tool can't be missing from it", async () => {
    const w = world();
    for (const [role, scope] of [["member", "read_write"], ["admin", "read_write"], ["owner", "read"]] as const) {
      const { tools, registered } = w.toolsFor(role, scope);
      const guide = await w.call(tools, "tracking_guide");
      const indexed = [...guide.split("## Tools available to this key")[1].matchAll(/^- `([a-z_]+)`/gm)].map((m) => m[1]);
      expect(indexed.sort()).toEqual([...tools.keys()].sort());
      expect(registered.map((t) => t.name).sort()).toEqual([...tools.keys()].sort());
    }
  });

  it("tells a member what their role can't do, and an admin that everything is open", async () => {
    const w = world();
    const member = await w.call(w.toolsFor("member").tools, "tracking_guide");
    const admin = await w.call(w.toolsFor("admin").tools, "tracking_guide");
    expect(member).toMatch(/workspace \*\*member\*\*/);
    expect(member).toMatch(/you see only your own time/);
    expect(member).toMatch(/you can't see the team's hours/);
    expect(admin).toMatch(/workspace \*\*admin\*\*/);
    expect(admin).not.toMatch(/you see only your own time/);
    expect(admin).toMatch(/group: "user"/);
  });

  it("teaches Markdown for task notes and comments", async () => {
    const w = world();
    const guide = await w.call(w.toolsFor("member").tools, "tracking_guide");
    expect(guide).toMatch(/\*\*Markdown\*\*/);
    // The editor's whole feature list reaches the model, from the one list in @shared/markdown-doc.
    for (const syntax of ["- [ ] to do", "~~strike~~", "<u>underline</u>", '<span style="color:', "---", "File card"]) {
      expect(guide).toContain(syntax);
    }
  });
});

describe("a member's answers say where their role limited them", () => {
  it("names the project fields a member's create_project didn't save", async () => {
    const w = world();
    const member = JSON.parse(await w.call(w.toolsFor("member").tools, "create_project", { name: "Site", clientId: "cl-A", billable: true, rate: 150 }));
    expect(member.note).toMatch(/Not saved: rate/);
    const admin = JSON.parse(await w.call(w.toolsFor("admin").tools, "create_project", { name: "Site 2", clientId: "cl-A", billable: true, rate: 150 }));
    expect(admin.note).toBeUndefined();
    expect(admin.rate).toBe(150);
  });

  it("marks a member's totals as their own hours only, and an admin's not", async () => {
    const w = world();
    // Called past the MCP schema, so its `groupBy` default is passed by hand.
    const range = { since: "2026-01-01", until: "2026-01-31", timezoneOffsetMinutes: 0, groupBy: "project" };
    const member = JSON.parse(await w.call(w.toolsFor("member").tools, "get_time_summary", range));
    const admin = JSON.parse(await w.call(w.toolsFor("admin").tools, "get_time_summary", range));
    expect(member.scope).toMatch(/own hours only/);
    expect(admin.scope).toBeUndefined();
  });
});
