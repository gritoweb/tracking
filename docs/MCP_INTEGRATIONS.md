# MCP (Model Context Protocol) Integrations Checklist

This document tracks which features of our application are currently exposed to AI agents via the MCP server (`src/worker/mcp/server.ts`) and which are still missing. Use this checklist to ensure the AI doesn't have blind spots when helping the user.

## ✅ Currently Integrated (Available to AI)

### Time & Tracking
- [x] **Timer Control:** Start a timer, stop a timer, and check the currently running timer.
- [x] **Manual Logging:** Log past time entries.
- [x] **Drafts (Calendar):** List draft entries and mass-draft a whole day (`draft_day`).
- [x] **Reporting:** Pull time summaries (`get_time_summary`) and project pacing/budget status (`get_project_pacing`).
- [x] **Time Entries:** List tracked time entries.

### Entities (Creation & Reading)
- [x] **Clients:** List all clients, create new client.
- [x] **Projects:** List all projects, create new project.
- [x] **Tasks:** Create a new task, move task to a different status column.

---

## ⏳ Missing Integrations (To Be Developed)

### Modification & Deletion (Crucial)
- [ ] **Delete Entities:** No ability to delete tasks, time entries, projects, or clients.
- [ ] **Update Entities:** No ability to edit a task's title, a project's budget, or fix a time entry.

### Advanced Task Features
- [ ] **Task Assignees:** Cannot assign a member to a task or remove them.
- [ ] **Comments:** Cannot read, add, or reply to comments inside a task.
- [ ] **Attachments:** Cannot view or upload file attachments on a task.
- [ ] **Task Statuses:** Cannot list or manage custom task statuses (it only guesses when moving).

### Organization, Productivity & Time
- [ ] **Tags:** Cannot create or list tags to classify time.
- [ ] **Favorites:** Cannot list or start a timer from saved favorites.
- [ ] **Recurring Entries:** Cannot manage or schedule recurring time logs.
- [ ] **Timesheet / Copy Week:** Cannot trigger bulk time actions like copying the previous week's timesheet.
- [ ] **Saved Reports:** Cannot pull custom bookmarked reports.

### Workspace & Account Management
- [ ] **Project Allocations:** Cannot allocate or restrict specific members to specific projects.
- [ ] **Members:** Cannot invite, list, or remove team members.
- [ ] **Notifications:** Cannot read or dismiss user notifications.
- [ ] **Integrations:** Cannot manage Google Calendar sync or URL guards.
- [ ] **Settings:** Cannot change workspace settings (e.g., currency, timezone, week start).
- [ ] **API Keys:** Cannot list or revoke active API keys.
