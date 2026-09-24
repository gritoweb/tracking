// The MCP server: this workspace's time data, exposed to Claude, ChatGPT, or any
// other MCP client over Streamable HTTP.
//
// Every tool is a thin wrapper over the same helpers the REST API uses — the
// report builder, the pacing computation, the draft pipeline — so an answer
// given in a chat window and an answer given on the Reports page come from one
// implementation and cannot disagree.
//
// Two rules hold throughout:
//   1. A tool never sees a workspace id from the caller. The workspace is fixed
//      at construction from the resolved API key, so no argument a model can
//      invent reaches a tenant boundary.
//   2. Write tools are registered ONLY for a read_write key. A read key is not
//      told they exist, rather than being refused when it calls them.
//
// Tools live in ./tools by subject. Most run through ./rest-bridge, which calls
// the app's own routers, so a tool can never disagree with the screen about
// what is allowed.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { appUrl } from "../lib/app-url";
import type { McpContext } from "./shared";
import { registerAllTools } from "./registry";

export type { McpContext } from "./shared";

// The wire identifier — stable, lowercase, and NOT for display. Clients key
// their config off it, so it must not change with the display name.
const SERVER_NAME = "timetracker";
const SERVER_VERSION = "2.0.0";


/**
 * What a client shows next to the connector: display name, site, blurb, icons.
 *
 * Deliberately no light/dark `theme` variants — the mark is a white clock on a
 * brand-red ground, so it reads on either. Declaring the same file twice under
 * two themes would be noise, and a theme-tagged icon that doesn't actually
 * change is worse than an untagged one.
 *
 * Icons are absolute URLs to the app's own public assets rather than data URIs:
 * they're already served (and cached) at the edge, and inlining ~35KB of base64
 * into every initialize response to save one cacheable request is a bad trade.
 */
const serverInfo = (env: Env) => ({
  name: SERVER_NAME,
  title: "TimeTracker",
  version: SERVER_VERSION,
  websiteUrl: appUrl(env),
  description:
    "Your tracked time, projects and budgets — ask about them in plain language, or start and stop timers.",
  icons: [
    { src: `${appUrl(env)}/logo.svg`, mimeType: "image/svg+xml", sizes: ["any"] },
    { src: `${appUrl(env)}/logo192.png`, mimeType: "image/png", sizes: ["192x192"] },
    { src: `${appUrl(env)}/logo512.png`, mimeType: "image/png", sizes: ["512x512"] },
  ],
});

/**
 * Sent to the client on connect and typically prepended to the model's context.
 *
 * Worth its length: each line here is a mistake the tools would otherwise
 * invite. The timezone one in particular — without it a model passes bare dates
 * and silently reads a UTC day, which for a user west of UTC quietly includes
 * the previous evening and drops their own.
 */
const SERVER_INSTRUCTIONS = `TimeTracker holds one workspace's tracked time and its plan: entries, timers, projects, clients, tags, tasks with their comments and images, favorites, recurring entries, saved reports and the Planner.

Working with it:
- Date ranges are the USER'S local calendar days. Pass \`timezoneOffsetMinutes\` (JS getTimezoneOffset sign: west of UTC is positive) on any tool that takes one, or the range silently means UTC days.
- Ids are opaque and must never be guessed: get them from \`list_projects\`, \`list_clients\`, \`list_tasks\`, \`list_task_statuses\`, \`list_members\`, \`list_tags\`, \`list_time_entries\` and the other list tools.
- Every entry needs a project, and every project a client. When the person didn't say which, ASK them and wait — never pick a project or client for them, and never create one to get past a refusal.
- A project listed with \`needsClient: true\` cannot take time until someone links its client in the app; offer that instead of logging elsewhere.
- Use \`get_time_summary\` for "how much", \`list_time_entries\` for "what was worked on", and \`run_report\` when a filter, rounding or per-person view is asked for.
- Money comes from each project's own hourly rate. A project with no rate contributes 0 to any amount — report that as "no rate set", never as "earned nothing".
- Drafted entries are PROPOSALS, not tracked time. They appear in no report and no total until a person reviews and confirms them in the app; \`draft_day\` creates them, it does not log time.
- Tasks are the plan, entries are the actual time. Due dates are local days (YYYY-MM-DD), never instants.
- "My tasks" with no day named means every open task of the person (\`list_tasks\` with assignee \`me\` and no \`dueBy\`), answered grouped by status as the tool returns it; filter by date only when the person names a day or period. Completed tasks are left out unless the person asks which are done — then pass \`includeDone\` and report the groups whose category is \`completed\`.
- Several items at once (create, move, edit or delete several tasks; log, edit or delete several entries) go in ONE call to the batch tool (\`create_tasks\`, \`move_tasks\`, \`update_tasks\`, \`delete_tasks\`, \`log_times\`, \`update_time_entries\`, \`delete_time_entries\`), never one call per item: the person approves once. One task for several people is ONE task with several \`assigneeIds\`.
- Every tool obeys the same permissions as the app for the key's owner: a member edits only their own entries, and editing projects, clients, statuses and budgets is for owners/admins. A refusal is the app's answer — report it, don't work around it.
- Before any delete or archive, confirm with the person which exact item they mean.
- To tag a person in a comment write @[Name](user:ID) using their id from \`list_members\`; never invent an id.
- Tasks, time entries and comments in a result carry a \`url\`. When you create, change or find one for the person, give them that link (as \`[name](url)\` where markdown renders) so they can open it. Never build a url yourself.
- Call \`list_clients\`/\`list_projects\` before \`create_client\`/\`create_project\` to check one doesn't already exist under a slightly different name — neither tool is idempotent, so a retry makes a duplicate.`;

export function buildMcpServer(ctx: McpContext): McpServer {
  const server = new McpServer(serverInfo(ctx.env), { instructions: SERVER_INSTRUCTIONS });
  registerAllTools(server, ctx);
  return server;
}
