import { z, type ZodRawShape } from "zod";
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

/** Where a tool module registers: the MCP server itself, or the chat's recorder (mcp/chat-tools.ts). */
export type ToolRegistrar = Pick<McpServer, "registerTool">;

/** What every tool module receives: where to register and this request's bindings. */
export interface ToolDeps {
  server: ToolRegistrar;
  ctx: McpContext;
  env: Env;
  db: D1Database;
  workspaceId: string;
  userId: string;
  /** Null for owner/admin (whole workspace), the caller's id for a member (D3). */
  scopeUserId: () => Promise<string | null>;
  bridge: RestBridge;
}

/** MCP tool results are text; JSON is the most reliably parsed shape for one. Unindented: a model reads it the same, and indentation is paid for in tokens on every result. */
export function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value) }] };
}

export function text(value: string) {
  return { content: [{ type: "text" as const, text: value }] };
}

/** A refusal the model should act on: marked as an error so clients show it as one. */
export function refuse(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

/** Keys that are UI plumbing, not answers — stripped so a tool result spends its tokens on content. */
const NOISE_KEYS = new Set(["workspaceId", "userImage", "image", "projectColor", "statusColor", "boardOrder", "sortOrder"]);

export function compact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(compact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).filter(([k]) => !NOISE_KEYS.has(k)).map(([k, v]) => [k, compact(v)])
    );
  }
  return value;
}

/** A bridged route's answer as a tool result: the data, or the server's own refusal marked as an error. */
export function fromBridge<T>(result: BridgeResult<T>, shape?: (data: T) => unknown) {
  if (!result.ok) return refuse(result.error);
  return json(compact(shape ? shape(result.data) : result.data));
}

/** One description per field name, applied to every tool's input that doesn't carry its own. */
const FIELD_DOCS: Record<string, string> = {
  name: "Display name",
  description: "Free text: an entry's work description, a task's notes (plain text), a template's description",
  notes: "Free-text notes about the client",
  email: "Contact email",
  phone: "Contact phone",
  address: "Postal address",
  projectId: "Project id from list_projects",
  clientId: "Client id from list_clients",
  taskId: "Task id from list_tasks; null clears it",
  parentId: "Parent task id from list_tasks to make this a subtask (one level only); null makes it top-level",
  statusId: "Opaque status id from list_task_statuses — never a name or category; omit to use the default column",
  assigneeIds: "Member userIds from list_members; replaces the whole list",
  mentionedUserIds: "Member userIds from list_members to notify",
  attachmentId: "An attachment id from upload_task_attachment to show with the comment; null removes it",
  tags: "Tag names (not ids); unknown names are created. Replaces the whole list",
  billable: "Whether the time is billable to the client; entries are billable unless this says false",
  color: "A #rrggbb colour",
  dueDate: "Local due day, YYYY-MM-DD; null clears it",
  priority: "1 = urgent … 4 = none; omit unless the person set a priority",
  estimatedSeconds: "Time estimate in seconds (3600 = 1h); null clears it",
  recurRule: "Repeat rule: daily | weekdays | weekly:0,2,4 (0 = Sunday) | monthly:15; null stops repeating",
  completedOn: "The person's local date (YYYY-MM-DD) when marking a task done — a repeating task schedules its next occurrence from it",
  active: "false completes a task / pauses a template / archives a project; true restores it",
  archived: "true archives the client, false restores it",
  sortOrder: "Position in the project's list (fractional index); leave out unless reordering",
  start: "ISO 8601 instant with offset, e.g. 2026-09-18T14:00:00-03:00",
  stop: "ISO 8601 instant after start",
  rate: "Hourly rate in the workspace currency; null clears it",
  startDate: "First day of the project, YYYY-MM-DD; null clears it",
  endDate: "Last day of the project, YYYY-MM-DD; null clears it",
  estimatedHours: "Hour budget for the project; null clears it",
  integrationId: "Workfront/Dynamics link — configured in the app; leave out",
  externalProjectId: "Workfront/Dynamics project id — configured in the app; leave out",
  externalTaskId: "Workfront/Dynamics task id — configured in the app; leave out",
  category: "not_started | active | completed — what a task in this column counts as",
  isDefault: "true makes this the column new tasks land in",
  moveTo: "Status id that receives this column's tasks; required when it still holds any",
  body: "The comment text, plain, up to 4000 characters",
  filename: "File name shown in the app, e.g. screenshot.png",
  durationMinutes: "Length of each logged entry, in minutes",
  config: "The report filters, with the same keys run_report takes (e.g. {\"projectIds\":[\"…\"],\"billable\":\"billable\"})",
  date: "Local day, YYYY-MM-DD",
  plannedSeconds: "Planned time in seconds (3600 = 1h); 0 clears the cell",
  enabled: "true turns auto-track on, false off",
  provider: "Which calendar: google or microsoft",
  kind: "summary (totals + series) | grouped (tree) | weekly (project × day) | detailed (every entry)",
  projectIds: "Only these project ids",
  clientIds: "Only these client ids",
  taskIds: "Only these task ids",
  tagIds: "Only these tag ids (from list_tags)",
  userIds: "Only these members' userIds (owners/admins only)",
  search: "Case-insensitive text to find in entry descriptions",
  roundMode: "Per-entry rounding before totals: off | nearest | up | down",
  roundMinutes: "Rounding step in minutes, e.g. 15",
  currency: "3-letter currency code, e.g. BRL",
  timeFormat: "12h or 24h",
  weekStart: "First weekday: 0 = Sunday, 1 = Monday",
  showWeekends: "Show Saturday and Sunday in week views",
  autoAssignColors: "Colour new projects automatically",
  digestDaily: "Email a morning briefing",
  digestWeekly: "Email a Monday weekly summary",
  digestHour: "Local hour (0–23) the digests arrive",
  digestTimezoneOffsetMinutes: "UTC offset for the digests, JS getTimezoneOffset sign (west of UTC positive)",
};

/** The shape with FIELD_DOCS applied to every field that has no description of its own. */
export function documented(shape: ZodRawShape): ZodRawShape {
  return Object.fromEntries(
    Object.entries(shape).map(([key, field]) => {
      const doc = FIELD_DOCS[key];
      const schema = field as z.ZodType;
      return [key, schema.description || !doc ? schema : schema.describe(doc)];
    })
  );
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
  attrs?: { id?: unknown; label?: unknown };
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
    node.type === "text"
      ? (node.text ?? "")
      : node.type === "mention"
        ? `@${String(node.attrs?.label ?? node.attrs?.id ?? "")}`
        : (node.content ?? []).map(walk).join("");
  return (doc.content ?? []).map(walk).join("\n").trim() || null;
}
