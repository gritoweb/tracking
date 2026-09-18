// The one tool catalog: the MCP server and the in-app Assistant both register from here.
import type { ZodRawShape } from "zod";
import { entryScopeUserId, getMemberRole } from "../lib/permissions";
import { createRestBridge } from "./rest-bridge";
import { documented, type McpContext, type ToolDeps, type ToolRegistrar } from "./shared";
import { registerEntryReads, registerEntryWrites } from "./tools/entries";
import { registerTaskReads, registerTaskWrites } from "./tools/tasks";
import { registerCatalogReads, registerCatalogWrites } from "./tools/catalog";
import { registerProductivityReads, registerProductivityWrites } from "./tools/productivity";
import { registerAccountReads, registerAccountWrites } from "./tools/account";

type RegisterFn = (name: string, config: { inputSchema?: ZodRawShape }, cb: unknown) => unknown;

/** Every tool's input gets the shared field docs, so no field reaches a model undescribed. */
function documentedRegistrar(registrar: ToolRegistrar): ToolRegistrar {
  const register = registrar.registerTool.bind(registrar) as unknown as RegisterFn;
  const registerTool: RegisterFn = (name, config, cb) =>
    register(name, config.inputSchema ? { ...config, inputSchema: documented(config.inputSchema) } : config, cb);
  return { registerTool } as unknown as ToolRegistrar;
}

export function registerAllTools(registrar: ToolRegistrar, ctx: McpContext): void {
  const { env, workspaceId, userId, scope, executionCtx } = ctx;
  const db = env.DB;
  // Owner/admin read the whole workspace; a member reads only their own hours (D3).
  let scopePromise: Promise<string | null> | null = null;
  const scopeUserId = () =>
    (scopePromise ??= getMemberRole(db, workspaceId, userId).then((role) => entryScopeUserId(role, userId)));

  const deps: ToolDeps = {
    server: documentedRegistrar(registrar),
    ctx, env, db, workspaceId, userId, scopeUserId,
    bridge: createRestBridge(env, executionCtx, workspaceId, userId),
  };

  registerCatalogReads(deps);
  registerEntryReads(deps);
  registerTaskReads(deps);
  registerProductivityReads(deps);
  registerAccountReads(deps);

  // Write tools exist only for a read_write key: a read key is not told they exist, rather than refused.
  if (scope !== "read_write") return;

  registerCatalogWrites(deps);
  registerTaskWrites(deps);
  registerEntryWrites(deps);
  registerProductivityWrites(deps);
  registerAccountWrites(deps);
}
