# MCP coverage checklist

What the MCP server (`src/worker/mcp/`) exposes to AI clients, and what stays in the app on purpose.
**67 tools as of 2026-09-18: 25 read tools, and 42 write tools registered only for a `read_write` key.**
Tool reference: `docs/MCP.md`.

Every write tool obeys the same permissions as the app for the key's owner. Most run through
`mcp/rest-bridge.ts`, which calls the app's own routers with the key's workspace and person, so a
tool and the screen cannot disagree about validation or roles.

## Covered

### Time & tracking
- [x] **Timer:** `start_timer`, `stop_timer`, `get_running_timer`, `start_favorite`
- [x] **Entries:** `log_time`, `list_time_entries`, `get_time_entry`, `update_time_entry`, `delete_time_entry`
- [x] **Copy a week:** `copy_week` (all or nothing)
- [x] **Reports:** `get_time_summary`, `get_project_pacing`, `run_report` (summary, grouped, weekly, detailed, with filters and rounding)
- [x] **Drafts:** `list_drafts`, `draft_day` (drafts are proposals, confirmed in the app)

### Catalog
- [x] **Clients:** `list_clients`, `create_client`, `update_client`, `archive_client`
- [x] **Projects:** `list_projects`, `create_project`, `update_project`, `archive_project`
- [x] **Tags:** `list_tags`, `create_tag`, `update_tag`, `delete_tag`

### Tasks
- [x] **Tasks:** `list_tasks`, `get_task`, `create_task`, `update_task` (also completes, with recurrence), `move_task`, `delete_task`
- [x] **Statuses:** `list_task_statuses`, `create_task_status`, `update_task_status`, `archive_task_status`
- [x] **Assignees:** through `create_task` / `update_task` (`assigneeIds`), with ids from `list_members`
- [x] **Comments:** `list_task_comments`, `add_task_comment`, `edit_task_comment`, `delete_task_comment` — flat, no replies (decision D8)
- [x] **Attachments:** `list_task_attachments`, `upload_task_attachment` (PNG/JPEG/WebP/GIF, base64, 10 MB), `delete_task_attachment`

### Productivity
- [x] **Favorites:** `list_favorites`, `create_favorite`, `delete_favorite`, `start_favorite`
- [x] **Recurring entries:** `list_recurring`, `create_recurring`, `update_recurring`, `delete_recurring` (local weekdays and time in, UTC stored)
- [x] **Saved reports:** `list_saved_reports`, `create_saved_report`, `delete_saved_report`
- [x] **Planner:** `get_planner`, `set_planner_hours` (planned hours per project per day, not access control)

### Account
- [x] **Who am I:** `whoami` (role, `canManage`)
- [x] **Notifications:** `list_notifications`, `mark_notification_read`, `mark_all_notifications_read`, `delete_notification`
- [x] **Settings (own):** `get_settings`, `update_settings`
- [x] **Calendar:** `get_calendar_status`, `set_calendar_auto_track`

### Read-only by decision
- [x] **Members:** `list_members` — inviting and removing people stay in the app
- [x] **API keys:** `list_api_keys` — creating and revoking keys stay in the app (a key that can mint keys turns one leak into permanent access)

## Not exposed, on purpose

- **Invite / remove members, create / revoke API keys** — admin actions stay behind a browser session (Luis, 2026-09-18).
- **Connect a calendar** — OAuth needs a browser; only the status and the auto-track switch are exposed.
- **Integrations (Workfront, Dynamics)** — outbound pushes, admin-configured in the app.
- **Assistant chat and memory** — the Assistant is itself an AI client of the app.
