/** A prompt to paste into Claude Code: registers the MCP server with the key and installs a /tracking skill. */
export function buildClaudeCodeSetupPrompt(mcpUrl: string, apiKey: string): string {
  return `Set up my TimeTracker connection in Claude Code, step by step:

1. Run this command:
claude mcp add --transport http --scope user --header "Authorization: Bearer ${apiKey}" tracking ${mcpUrl}

2. Create the file ~/.claude/skills/tracking/SKILL.md with exactly this content:
---
name: tracking
description: Manage my TimeTracker time entries, tasks, projects, clients and reports through the "tracking" MCP server. Use when I type /tracking or ask about my hours, timesheet, tasks or clients.
---
Use the tools of the "tracking" MCP server for everything about my tracked time and tasks.
- Get ids from the list_* tools first (list_projects, list_tasks, list_members, list_clients); never guess an id.
- Pass timezoneOffsetMinutes with my UTC offset on every tool that takes it, so dates mean my days.
- Every time entry needs a project: ask me which one when I didn't say.
- Confirm with me before any delete or archive.
- Answer in the language I wrote in.

3. Restart is not needed for the skill; for the server, run /mcp and confirm "tracking" is connected, then call its whoami tool.

4. Finish by telling me: "TimeTracker connected! Now just type /tracking followed by what you want."`;
}
