// The Assistant's chat-only tools. Everything else it can do comes from the MCP catalog
// (mcp/chat-tools.ts), so the chat and the MCP server share one set of tools.

import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { rememberFact, searchMemories } from "./assistant-memory";
import { inferProjectForTitle } from "./projects";
import { loadGroundingProjects, resolveGrounding } from "./ai";
import { createRestBridge } from "../mcp/rest-bridge";

export interface AssistantToolContext {
  env: Env;
  workspaceId: string;
  /** The person chatting: every tool reads and writes only their own time. */
  userId: string;
  /** JS getTimezoneOffset() convention (minutes). */
  offsetMinutes: number;
  executionCtx: ExecutionContext;
}

const ISO = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "must be an ISO 8601 timestamp");

export function buildAssistantTools(ctx: AssistantToolContext): ToolSet {
  const { env, workspaceId, userId } = ctx;
  const db = env.DB;
  const bridge = createRestBridge(env, ctx.executionCtx, workspaceId, userId);

  return {
    trackMeeting: tool({
      description:
        "Add a meeting from the user's calendar (listed in CURRENT FACTS) to the timesheet as a finished entry. Pass projectName when the user named one; otherwise the project is inferred from the title, and a meeting that matches no project is not logged — then ask which project.",
      inputSchema: z.object({
        title: z.string().max(500).describe("The meeting title, as it appears in CURRENT FACTS"),
        start: ISO.describe("Meeting start, UTC ISO 8601"),
        stop: ISO.describe("Meeting end, UTC ISO 8601, after start"),
        projectName: z.string().nullish().describe("Exact project name, if the user gave one"),
      }),
      // Creates a billable record: an instruction injected through calendar text must not log hours unconfirmed.
      needsApproval: true,
      execute: async ({ title, start, stop, projectName }) => {
        if (Date.parse(stop) <= Date.parse(start)) return { ok: false, reason: "Stop must be after start." };
        let projectId: string | null = null;
        if (projectName) {
          const projects = await loadGroundingProjects(db, workspaceId);
          const match = resolveGrounding(projectName, null, projects);
          if (match.projectMatched) projectId = match.projectId;
        } else {
          projectId = (await inferProjectForTitle(db, env.AI, workspaceId, title))?.projectId ?? null;
        }
        if (!projectId) {
          return { ok: false, reason: "Every entry needs a project. Ask the user which project (list_projects has them), then try again." };
        }
        const result = await bridge("POST", "/api/time_entries", {
          description: title,
          projectId,
          start: new Date(start).toISOString(),
          stop: new Date(stop).toISOString(),
        });
        if (!result.ok) return { ok: false, reason: result.error };
        const entry = result.data as { id: string; projectName: string | null };
        const durationHours = ((Date.parse(stop) - Date.parse(start)) / 3_600_000).toFixed(2);
        return { ok: true, entryId: entry.id, project: entry.projectName, durationHours };
      },
    }),

    rememberPreference: tool({
      description:
        "Remember a durable fact or preference about the user for future conversations, e.g. 'always mark Acme non-billable' or 'I start my day at 9am'. Use a short stable key.",
      inputSchema: z.object({
        key: z.string().max(80).describe("Short slug identifying the fact, e.g. 'acme-billing'"),
        content: z.string().max(1000).describe("The fact, phrased so it's useful later"),
      }),
      // Memory is replayed into every future prompt, so injected text must not plant a durable instruction unconfirmed.
      needsApproval: true,
      execute: async ({ key, content }) => {
        const { key: saved } = await rememberFact(db, workspaceId, userId, key, content);
        return { ok: true, key: saved };
      },
    }),

    searchMemory: tool({
      description: "Search the facts and preferences the user asked you to remember earlier, by keyword. Use before answering a question those facts might change.",
      inputSchema: z.object({ query: z.string().max(200).describe("A keyword or short phrase to look for") }),
      execute: async ({ query }) => {
        const memories = await searchMemories(db, workspaceId, userId, query);
        return { memories: memories.map((m) => m.content) };
      },
    }),
  };
}
