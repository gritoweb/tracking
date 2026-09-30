// tracking_guide: how to work in TimeTracker, written for the key that asks — its role, its scope and the tools it was given.
import type { ApiKeyScope } from "../lib/api-keys";
import { canManageWorkspace, type WorkspaceRole } from "../lib/permissions";
import type { RegisteredTool, ToolGroup } from "./registry";
import { RICH_TEXT_SYNTAX, RICH_TEXT_UNSUPPORTED } from "@shared/markdown-doc";

const GROUP_ORDER: ToolGroup[] = ["Time and reports", "Tasks", "Projects, clients and tags", "Planning and saved items", "You and the workspace"];

function toolIndex(tools: RegisteredTool[]): string {
  return GROUP_ORDER.map((group) => {
    const inGroup = tools.filter((t) => t.group === group);
    return inGroup.length ? `### ${group}\n${inGroup.map((t) => `- \`${t.name}\` — ${t.title}`).join("\n")}` : "";
  })
    .filter(Boolean)
    .join("\n\n");
}

function permissions(role: WorkspaceRole, scope: ApiKeyScope): string {
  if (scope === "read") {
    return "This is a **read-only key**: it can look things up but change nothing, and no tool that writes is offered to it. When the person asks for a change, say it needs a read-write key (Settings → Workspace → API keys) or to be done in the app.";
  }
  if (canManageWorkspace(role)) {
    return [
      `You act as a workspace **${role}**: everything the app allows is open to you — every person's hours and reports, editing and archiving projects and clients (rates, budgets, dates), the board's columns (statuses) and budget pacing.`,
      "Deleting or archiving is still confirmed with the person first.",
    ].join("\n");
  }
  return [
    "You act as a workspace **member**. What a member can't do is simply not among your tools; don't look for another way to do it.",
    "- **Hours and reports:** you see only your own time. Totals and reports say `scope: own hours only`; never present them as the team's. A question about the team's or someone else's hours: say an owner/admin can answer it.",
    "- **Time entries:** you log and change your own, not other people's.",
    "- **Projects:** you can create one (its rate and budget are left for an owner/admin — the result lists what wasn't saved) and link a client to a project that has none; renaming, re-rating, budgets or archiving are for an owner/admin.",
    "- **Clients:** you can create one; editing or archiving is for an owner/admin.",
    "- **Board columns (statuses):** you move tasks between them, but creating, renaming or archiving columns is for an owner/admin.",
    "- **Deleting:** a task, comment or file you didn't create is deleted by its author or an owner/admin. Archiving a task (`update_task` with `archived`) follows the same rule.",
  ].join("\n");
}

function examples(role: WorkspaceRole, scope: ApiKeyScope): string {
  const manager = canManageWorkspace(role);
  const lines = [
    `- "Log 2h yesterday on ODL" → \`list_projects\` (find ODL; ask if two match or none does) → \`log_time\` with \`start\`/\`stop\` on yesterday in the person's own offset (e.g. \`2026-09-27T09:00:00-03:00\` to \`11:00\`) and a short \`description\` → reply with the entry's link.`,
    `- "Move task X to QA" → \`list_tasks\` with \`search: "X"\` → \`list_task_statuses\` with that task's \`projectId\` (pick the column named QA) → \`move_task\`.`,
    `- "Create a task to review the landing page, with the goal, steps and acceptance criteria" → \`list_projects\` (ask which project if they didn't say) → \`create_task\` with \`name\` and \`description\` in the card shape below → reply with the task's link.`,
    `- "Write the acceptance criteria on task X" → \`get_task\` (keep what the notes already say) → \`update_task\` with \`description\` in Markdown: the card's acceptance-criteria section (\`# ✅ Critério de aceite\` in Portuguese) with \`- [ ]\` items, the rest kept.`,
    manager
      ? `- "How many hours did the team do last week?" → \`get_time_summary\` for last Monday–Sunday with \`timezoneOffsetMinutes\` (per project), or \`run_report\` \`grouped\` with \`group: "user"\` for per person.`
      : `- "How many hours did the team do last week?" → you can't see the team's hours: say so, and offer your own week with \`get_time_summary\` (it answers with \`scope: own hours only\`).`,
  ];
  if (scope === "read") lines.splice(0, lines.length, lines[lines.length - 1]);
  return lines.join("\n");
}

/** The guide as Markdown, for the key's role and scope, indexing exactly the tools it was given. */
export function buildTrackingGuide(role: WorkspaceRole, scope: ApiKeyScope, tools: RegisteredTool[]): string {
  return `# Working in TimeTracker

Read this once per conversation, before the first action. It is generated for this key, so it is always current.

## What this key can do
${permissions(role, scope)}

## Rules
- Ids are never guessed: get them from \`list_projects\`, \`list_clients\`, \`list_tasks\`, \`list_task_statuses\`, \`list_members\` and the other list tools.
- Dates are the person's local days: pass \`timezoneOffsetMinutes\` (JS getTimezoneOffset sign: west of UTC is positive) on every tool that takes it.
- Every time entry needs a project, and every project a client. If the person didn't say which, ask — never pick one or create one to get past a refusal.
- Confirm with the person before deleting or archiving anything.
- Archived tasks are left out of \`list_tasks\`; pass \`includeArchived: true\` only when the person asks for archived or old tasks, and show only the ones marked \`archived\`.
- Answer in the language the person wrote in, and give the \`url\` of what you created or changed as a link.

## Writing task notes and comments
They are **Markdown**, and the app shows them in its rich editor. Everything the editor can show:
${RICH_TEXT_SYNTAX.map(([what, how]) => `- ${what}: ${how}`).join("\n")}

${RICH_TEXT_UNSUPPORTED} Use headings, lists and checklists rather than one long paragraph.

A new task's notes follow the team's card shape, unless the person asked for another. Section names go in the person's language; the emojis are the house style, not a requirement:
\`\`\`
# 🎯 Objetivo
<what this task delivers and why, in one or two lines>

# 📋 Contexto
- <how things are today, and what was already decided>

# ✅ Critério de aceite
- [ ] <each thing that must be true for the task to be done>

# 🔧 Specs técnicas
- <how to do it: constraints, risks, the order of steps, what to check afterwards>
\`\`\`
Leave out a section the person gave nothing for, rather than inventing its content. When changing notes, read them first with \`get_task\` and send the whole text back with your change. A time entry's description is different: plain text, it can end up on a client's invoice.

## When something is refused
A refusal is the app's answer for this person: tell them plainly what couldn't be done and who can do it. Never work around it (another tool, a new project, client or column, someone else's id).

## Examples
${examples(role, scope)}

## Tools available to this key
${toolIndex(tools)}
`;
}
