// The one tool catalog: the MCP server and the in-app Assistant both register from here.
import type { ZodRawShape } from "zod";
import { canManageWorkspace, entryScopeUserId, getMemberRole } from "../lib/permissions";
import { createRestBridge } from "./rest-bridge";
import { documented, type McpContext, type ToolDeps, type ToolRegistrar } from "./shared";
import { registerEntryReads, registerEntryWrites } from "./tools/entries";
import { registerTaskReads, registerTaskWrites } from "./tools/tasks";
import { registerCatalogReads, registerCatalogWrites } from "./tools/catalog";
import { registerProductivityReads, registerProductivityWrites } from "./tools/productivity";
import { registerAccountReads, registerAccountWrites, registerGuide } from "./tools/account";

type RegisterFn = (name: string, config: { title?: string; inputSchema?: ZodRawShape }, cb: unknown) => unknown;

/**
 * Tools only owners/admins may use (the routes behind them refuse a member: lib/permissions `canManageWorkspace`).
 * A member's key is not shown them at all, the same way a read key is not shown write tools.
 */
export const MANAGER_ONLY_TOOLS: ReadonlySet<string> = new Set([
  "get_project_pacing",
  "archive_project",
  "update_client",
  "archive_client",
  "fork_task_statuses",
  "create_task_status",
  "update_task_status",
  "archive_task_status",
]);

export type ToolGroup = "Time and reports" | "Tasks" | "Projects, clients and tags" | "Planning and saved items" | "You and the workspace";

/** What was actually registered for this key, in order: the guide's tool index is built from it, never written by hand. */
export interface RegisteredTool {
  name: string;
  title: string;
  group: ToolGroup;
}

export function registerAllTools(registrar: ToolRegistrar, ctx: McpContext): RegisteredTool[] {
  const { env, workspaceId, userId, scope, role, executionCtx } = ctx;
  const db = env.DB;
  const canManage = canManageWorkspace(role);
  const registered: RegisteredTool[] = [];
  const register = registrar.registerTool.bind(registrar) as unknown as RegisterFn;

  // Owner/admin read the whole workspace; a member reads only their own hours (D3).
  let scopePromise: Promise<string | null> | null = null;
  const scopeUserId = () =>
    (scopePromise ??= getMemberRole(db, workspaceId, userId).then((role) => entryScopeUserId(role, userId)));

  const base = {
    ctx, env, db, workspaceId, userId, scopeUserId, canManage,
    bridge: createRestBridge(env, executionCtx, workspaceId, userId),
  };

  /** Every tool's input gets the shared field docs, a member skips manager-only tools, and each one is recorded. */
  const depsFor = (group: ToolGroup): ToolDeps => {
    const registerTool: RegisterFn = (name, config, cb) => {
      if (!canManage && MANAGER_ONLY_TOOLS.has(name)) return undefined;
      registered.push({ name, title: config.title ?? name, group });
      return register(name, config.inputSchema ? { ...config, inputSchema: documented(config.inputSchema) } : config, cb);
    };
    return { ...base, server: { registerTool } as unknown as ToolRegistrar };
  };

  registerEntryReads(depsFor("Time and reports"));
  registerTaskReads(depsFor("Tasks"));
  registerCatalogReads(depsFor("Projects, clients and tags"));
  registerProductivityReads(depsFor("Planning and saved items"));
  registerAccountReads(depsFor("You and the workspace"));

  // Write tools exist only for a read_write key: a read key is not told they exist, rather than refused.
  if (scope === "read_write") {
    registerEntryWrites(depsFor("Time and reports"));
    registerTaskWrites(depsFor("Tasks"));
    registerCatalogWrites(depsFor("Projects, clients and tags"));
    registerProductivityWrites(depsFor("Planning and saved items"));
    registerAccountWrites(depsFor("You and the workspace"));
  }

  // Last, so its index lists every tool this key was given (itself included).
  registerGuide(depsFor("You and the workspace"), registered);
  return registered;
}
