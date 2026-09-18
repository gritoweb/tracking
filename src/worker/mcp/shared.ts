import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ApiKeyScope } from "../lib/api-keys";
import type { BridgeResult, RestBridge } from "./rest-bridge";

/** Cap on rows any single tool returns, so one call can't blow the context window. */
export const ROW_LIMIT = 200;

/**
 * Behaviour hints clients use to badge a tool and decide how loudly to ask
 * before running it. Every tool here reads or writes this one workspace's own
 * database and never reaches the open internet, hence `openWorldHint: false`
 * throughout — that is a claim about blast radius, so it should stay accurate
 * if a tool ever grows an outbound call.
 */
export const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;
export const MUTATES = {
  readOnlyHint: false,
  destructiveHint: false,
  openWorldHint: false,
} as const;
/** Deletes or overwrites something a person made — clients ask before running these. */
export const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  openWorldHint: false,
} as const;

export interface McpContext {
  env: Env;
  workspaceId: string;
  userId: string;
  scope: ApiKeyScope;
  executionCtx: ExecutionContext;
}

/** What every tool module receives: the server to register on and this request's bindings. */
export interface ToolDeps {
  server: McpServer;
  ctx: McpContext;
  env: Env;
  db: D1Database;
  workspaceId: string;
  userId: string;
  /** Null for owner/admin (whole workspace), the caller's id for a member (D3). */
  scopeUserId: () => Promise<string | null>;
  bridge: RestBridge;
}

/** MCP tool results are text; JSON is the most reliably parsed shape for one. */
export function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

export function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

/** A bridged route's answer as a tool result: the data, or the server's own refusal marked as an error. */
export function fromBridge<T>(result: BridgeResult<T>, shape?: (data: T) => unknown) {
  if (!result.ok) {
    return { content: [{ type: "text" as const, text: result.error }], isError: true };
  }
  return json(shape ? shape(result.data) : result.data);
}

export const DateArg = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .describe("A calendar date, YYYY-MM-DD");

/**
 * A range of the caller's LOCAL dates → the UTC half-open interval the report
 * queries expect.
 *
 * The offset matters more than it looks. Asked "how much did I track
 * yesterday", a client seven hours west of UTC that got a UTC-day window would
 * report a day shifted by seven hours — quietly including the previous
 * evening's work and dropping its own. Defaults to 0 (UTC) when the client
 * doesn't say, which is at least a defensible reading of a bare date.
 */
export function rangeToIso(since: string, until: string, offsetMinutes = 0) {
  const startMs = new Date(`${since}T00:00:00.000Z`).getTime() + offsetMinutes * 60_000;
  const endMs =
    new Date(`${until}T00:00:00.000Z`).getTime() + offsetMinutes * 60_000 + 86_400_000;
  return {
    sinceIso: new Date(startMs).toISOString(),
    untilIso: new Date(endMs).toISOString(),
  };
}

/** Shared arg so date ranges mean the caller's days, not the server's. */
export const TimezoneArg = z
  .number()
  .int()
  .min(-900)
  .max(900)
  .default(0)
  .describe(
    "The user's UTC offset in minutes, JS getTimezoneOffset sign (west of UTC is positive). Pass it so the date range means their days, not UTC's."
  );

export const IdArg = (what: string) =>
  z.string().min(1).describe(`The ${what} id — from a list_* tool, never guessed`);

export function hours(seconds: number): number {
  return Math.round((seconds / 3600) * 100) / 100;
}

interface RichNode {
  type?: string;
  text?: string;
  content?: RichNode[];
}

/** A task description is a tiptap JSON doc (or legacy plain text); models read it as plain text. */
export function richTextToPlain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let doc: RichNode;
  try {
    doc = JSON.parse(raw) as RichNode;
  } catch {
    return raw;
  }
  if (doc?.type !== "doc") return raw;
  const walk = (node: RichNode): string =>
    node.type === "text" ? (node.text ?? "") : (node.content ?? []).map(walk).join("");
  return (doc.content ?? []).map(walk).join("\n").trim() || null;
}
