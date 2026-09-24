# Time Tracker — User Guide

Everything you can do in [tracking.gritoweb.com.br](https://tracking.gritoweb.com.br), organized by task. If you're new, read [Getting started](#getting-started) and [Tracking time](#tracking-time) — the rest is reference.

## Contents

- [Getting started](#getting-started)
- [Tracking time](#tracking-time)
- [The Timer workspace (views)](#the-timer-workspace-views)
- [Draft your day & review](#draft-your-day--review)
- [Organizing work: clients, projects, tasks, tags](#organizing-work-clients-projects-tasks-tags)
- [Favorites & recurring entries](#favorites--recurring-entries)
- [Calendar sync & auto-track (Google + Outlook)](#calendar-sync--auto-track-google--outlook)
- [The Assistant](#the-assistant)
- [Budgets & pacing](#budgets--pacing)
- [Email digests](#email-digests)
- [Ask your AI assistant (MCP)](#ask-your-ai-assistant-mcp)
- [Reports & exports](#reports--exports)
- [Productivity tools](#productivity-tools)
- [Teams & sharing a workspace](#teams--sharing-a-workspace)
- [Browser extension](#browser-extension)
- [Integrations (Workfront, Dynamics)](#integrations-workfront-dynamics)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Offline & sync behavior](#offline--sync-behavior)
- [Account & security](#account--security)
- [Settings reference](#settings-reference)

---

## Getting started

1. **Get invited** — access is invite-only. Open the link in the invitation email and sign in with that same address (one-time code, magic link, or Google): your account is created and you join the inviting workspace. Without an invitation, sign-in is refused.
2. **Add a client and a project** under **Clients** and **Projects**. Every project belongs to a client and every entry to a project, so this comes before the first timer (a project can have a billing rate — that's what turns hours into amounts in Reports).
3. **Start a timer** from the top bar: type a description, pick a project, hit the red start button.

Sign-in is passwordless: a **6-digit email code**, a **magic link**, **Google**, or a **passkey** (add one under Settings → Security for Touch ID / security-key sign-in).

## Tracking time

There are five ways to get time into your timesheet:

- **Live timer** — type a description in the top bar, pick project/task/tags, press start. Press stop when done. The elapsed time of a *running* timer can be edited in place from the top bar if you started it late.

  Every entry needs a project. Press **Start** (or `Alt+Shift+S`, a favorite, Continue, or a nudge's start) with no project picked and the project picker opens; the timer starts the moment you choose one, and closing the picker starts nothing. The Add entry, calendar, log-time, AI Quick Add and recurring forms keep their save button disabled until a project is chosen, and a draft can't be added to the timesheet without one.

  Whether the time is **billable** is shown by the `$` toggle in the bar. Every entry starts billable — turn the toggle off if this one isn't. Click it any time to override either way — while a timer is running, the change applies to the running entry immediately. Billable is the only thing Reports uses to work out billable hours and invoiced amounts.
- **Manual entry** — **Add Entry** on the Timer page for time you've already spent; pick start/end or a duration.
- **AI Quick Add** — describe the entry in plain language ("45 min standup for Acme this morning, billable") and the app parses it into a real entry, matched against your actual projects and tasks. It warns you when it isn't sure about a match.
- **Timesheet grid** — the Timesheet view is a weekly grid: one row per project/task combination, type hours directly into day cells.
- **Calendar click-to-track** — with Google Calendar connected, click a "ghost" event on the calendar to convert it into an entry.

Entries support **description, project, task, tags, billable flag**, and inline editing after the fact. In the list, click a description, a duration, or a time range to edit it in place — each saves on Enter or blur and shows a small check when it lands. A running entry's start time and date are editable the same way (its stop shows "Still running"). Durations accept `1h 30m`, `1:30`, `90m`, or a plain number of minutes; anything unrecognized keeps the field open and marked rather than discarding what you typed. Deleting is undoable from the toast — for a single entry, a selection, or a whole repeated-description group. The description is plain free text — no suggestions drop down while you type. To repeat the last thing you tracked, use **Continue** in the timer bar (or on an entry row), which restores its description, project, task, billable flag and tags. Bulk edit/delete is available from the entry list.

## The Timer workspace (views)

The Timer tab hosts five interchangeable views behind one shared header (date navigation, weekends toggle, zoom):

- **List** — entries grouped by day, with day totals.
- **Calendar** — a Toggl-style FullCalendar grid (week / 5-day / day / month). One row per hour. Real entries render as colored blocks showing the client, project and who logged them, and unconfirmed Google Calendar events show as dashed "ghosts". Click an empty spot to log 15 minutes starting at that quarter hour, or drag to mark a longer span.
- **Split** — calendar + list side by side (large screens).
- **Timesheet** — the weekly hours grid.
- **Planner** — plan your week ahead of time (see below).

A **"Logged" bar** in the header shows the day's total with per-project colored segments.

## Project Planner

The **Planner** view (Timer tab, last icon in the view switcher) is a weekly grid like the Timesheet, but its cells hold **planned hours** instead of tracked time — your personal allocation per project (and optional task) per day. Plans are **per user**: teammates in the same workspace each keep their own.

- **Enter a plan** by clicking a cell and typing a duration (`4h`, `1:30`, `90m` — a bare number means minutes). Clearing a cell removes the plan.
- **Plan vs. actual**: each cell shows your planned hours with the time you actually tracked beneath. Tracked time turns **amber when it exceeds the plan**. Rows appear for anything planned *or* tracked that week, so unplanned work is visible too. Totals per day, per row, and for the week show both numbers.
- **Add row** adds a project/task combination you haven't planned or tracked yet.
- **Copy last week's plan** duplicates the previous week's allocations onto the current week (with Undo).
- **Import CSV** accepts `Date,Project,Task,Hours` rows (paste or upload). Dates are `YYYY-MM-DD`; projects/tasks are matched by name; in the Hours column a plain number means **hours** (`1.5` = 1h 30m) and `1:30` / `1h 30m` / `90m` also work. A preview flags unknown projects, bad dates, and bad durations — clean rows import, flagged ones are skipped.

## Draft your day & review

Instead of reconstructing a day from memory, let the app propose it and confirm what's right.

Hit **Draft day** in the Timer header. The app looks at what it already knows about that day and proposes the entries that are missing:

- **Calendar events that ended without being tracked** — the meeting happened, it isn't on your timesheet.
- **Uncovered stretches** between the things you did track, inside your own working window (not the hours before you started).
- **Weekly habits** — work you log on this weekday most weeks but haven't logged today.

*When* something happened and *how long* it lasted always come from the signals themselves. AI is used for one thing only: writing the description and guessing the project, from a list of your real projects. If it isn't available, you still get the proposals — just in plainer words.

Proposals appear on the calendar as dashed, project-tinted blocks. **They are not tracked time.** Nothing reaches a report, an invoice, or a project total until you confirm it.

Click **Review** (or any dashed block) to step through them one card at a time. On each card you can:

- **Keep** it as it is
- **Reassign** it to a different project, or toggle billable
- **Rename** it — click the description
- **Nudge the minutes** with ±15 / ±30
- **Discard** it

Each card also tells you *why* it was proposed ("1h 30m between 10:00 and 11:30 isn't accounted for") so you can judge it rather than rubber-stamp it.

The last card asks **"How much time should we report?"** — set the day's real total and the drafted entries are scaled proportionally to hit it, instead of you hand-editing five entries. It tells you what it's about to change before it does. Confirm, and they become ordinary time entries you can edit like any other.

## Budgets & pacing

Budgets are team numbers, so everything in this section — the budget bar, the pacing verdict, the Assistant's budget warnings, the briefing's budget lines and the MCP pacing tool — is shown to workspace **owners and admins** only.

Give a project a **time target** (Projects → edit → estimated hours) and optionally an end date, and the Projects page starts telling you where it's heading, not just where it is:

- the share of the budget used
- a verdict underneath — *"on pace to overrun by 14h · 12 working days left"*, *"6h over budget"*, *"close to budget"*, or how much is left

The projection uses your burn rate per **working day** over the last two weeks. A project you haven't touched recently gets no verdict at all — it isn't on pace for anything, and guessing would just cry wolf.

Projects that are over, or heading over, also show up as Assistant nudges and in your email digest.

## Email digests

Under **Settings → Tracking → Email digests**:

- **Morning briefing** — yesterday's hours by project, budgets worth a look, anything waiting for review, and a short paragraph on where the time went.
- **Weekly summary** — the same for the week just gone, sent Monday.

Pick the hour they arrive (your local time). Both are off until you turn them on. **Send one now** mails you one immediately, so you can decide whether you want it before committing to a daily email.

## Ask your AI assistant (MCP)

Connect Claude, ChatGPT, or any other MCP client to your workspace and ask about your time in plain language — *"which clients were most profitable per hour last quarter?"*, *"is the Meridian project going to blow its budget?"*, *"what did I actually work on last Thursday?"*

Under **Settings → Workspace → MCP connector**:

1. Copy the **server URL** (`https://tracking.gritoweb.com.br/mcp`).
2. Create a key. **Read only** lets the assistant look at projects, clients, entries, summaries, budgets and drafts. **Read + write** also lets it start and stop timers, log entries, and draft a day.
3. Paste both into your client — it authenticates with `Authorization: Bearer <your key>`.

The key is shown **once** and can't be recovered; if you lose it, revoke it and make another. Revoking takes effect immediately.

**[docs/MCP.md](MCP.md)** has step-by-step setup for Claude Code, Claude Desktop and other clients, the full tool reference, and troubleshooting.

## Organizing work: clients, projects, tasks, tags

- **Clients** hold contact details and notes; each client's detail page shows its projects and recent activity.
- **Who changes what:** anyone in the workspace can add a client or a project — from its page, or straight from the project picker, which asks for the client. Editing, archiving and recoloring clients and projects, and setting a project's rate, budget, dates or integration link, is for **owners and admins**. The project picker groups projects under their client, and entry rows read *Project · Client*.
- **Projects** belong to a client (required — every project has one), carry a **color**, an optional **billing rate**, and an optional budget. The Projects page can be searched (by project *or* client name), sorted by name, client, tracked time or rate, and scoped to a period — the same four options Clients uses (this month / last month / this year / all time). Projects opens on **all time** and Clients on **this month**, because they answer different questions; both say which window they are showing, and the tracked figure on each row follows it. The budget bar underneath does **not** — a budget is cumulative, so `11h / 40h` is always all-time and says so when the page is scoped to anything else. Rate × billable hours = the amounts you see in Reports; whether an hour counts as billable is decided per entry (see above), never by the project.
- **Tasks** belong to projects, and are the plan side of the timer. A task carries a **status** (the board's columns — configurable per workspace), a **due date**, a **priority** (Urgent / High / Normal / None), an optional **estimate**, free-text **notes**, up to one level of **subtasks**, and an optional **repeat**. See "Planning with tasks" below.
- **Tags** are freeform labels; new tags automatically get a distinct color (editable later, along with renames, on the fly from any tag picker).

**Colors:** by default the app auto-assigns visually distinct colors to new projects and tags. Under Settings → Appearance you can toggle auto-assign and run **"Apply to existing"**, which uses AI to recolor your current projects sensibly (e.g. matching a project's name to a fitting hue) while keeping every color distinct.

## Planning with tasks

The Tasks page opens on **Board**, with a rail of your projects (grouped by client) on the left — pick a project, or a client to see all of its projects at once, to filter both layouts. The arrow beside each client folds its projects away (remembered next time), and owners/admins can right-click a client or project to edit or archive it. **List** is the same tasks as a flat list, with grouping, sorting and status filters. **Board** and **List** are two views of the same data, not a filter — the **Due** dropdown beside them narrows either one to **Today** (overdue counts as today too) or **Upcoming** (the next seven days).

**Capturing.** The field at the top of the list adds a task and stays open for the next one, so several go in as several lines of typing. It reads a few tokens out of what you type and strips them from the name:

| You type | You get |
|---|---|
| `draft report tomorrow` | due tomorrow |
| `send invoice fri` | due the coming Friday |
| `renew certs 10d` | due in 10 days (`w` and `m` work too) |
| `chase SOW p1` | priority Urgent (`p1`–`p4`) |
| `review deck #meridian` | filed under a project whose name starts that way |

The line under the field shows what it understood before you commit it.

**Turning a task into time.** Four ways, all of them one gesture:

- **Start a timer** — the ▷ on every row starts the clock with the task's name, project and task already set. While it runs the row shows a stop control instead.
- **Drag it onto the calendar** — open the task rail beside the Timer's calendar view and drag a task onto a time slot. That logs a finished entry there, as long as its estimate (or half an hour if it has none), with an **Undo** in the toast.
- **Log time already spent** — the clock icon opens the entry form prefilled from the task. Nothing is written until you submit. If the task was due before today, the form opens on the day it was due rather than on today.
- **Tick it off** — and if nothing is tracked against it, the confirmation offers to log the time then and there. In the other direction, stopping a timer on a task that's due today or has used up its estimate offers to mark it done.

**Notes.** A task can carry free-text notes — context, links, acceptance criteria, anything that isn't the name. They show as a single clamped line under the task on the list, in full in the task dialog. Notes belong to the *task* and are never copied onto a time entry, so internal detail can't end up on an invoice line.

**Editing.** Click a task's name to rename it in place, or its due-date chip to re-date it. **⋯ → Edit task…** opens the full form — name, notes, project, estimate, due date, priority and repeat — which is the same form used to create one.

**Subtasks.** A task can hold a checklist one level deep. Time is tracked against whichever one you actually worked on, and a parent's tracked total includes its subtasks'. Ticking a parent ticks its children with it.

**Repeats.** A task can repeat daily, on weekdays, weekly on chosen days, or monthly on a date. The next occurrence is created **when you tick the current one off** — so a repeating task you never complete simply goes overdue rather than piling up copies. If it has subtasks, the fresh occurrence gets a fresh checklist.

**Opening a task: modal or sidebar.** Clicking a task opens it in a **modal** (the default): the task's fields, notes, subtasks and attachments on the left, and its comments always visible on the right — no tab to switch. The button at the top right of the task swaps to the **sidebar** (the side panel, with Task and Comments as tabs) and back. Whichever you pick is remembered in this browser; another browser starts on the modal. On a narrow screen the modal puts the comments below the task.

**Formatting notes.** Select text in a task's description and a formatting bar appears over it, like ClickUp's: text or heading 1–3, bold, italic, underline, strikethrough, inline code, text color, link, bulleted/numbered list and checklist. Typing shortcuts still work (`# ` for a heading, `**bold**`, `[] ` for a checklist). Clicking into a long description expands it.

**Comments, mentions and images.** Open a task (in the sidebar, switch to **Comments**): the conversation sits in one frame and the field to write in sits in its own frame below it. Type `@` and the team is listed **beside the `@`** (not under the whole field); pick someone and their name goes into the text and they are notified. When two people share a name, the list adds their e-mail under it so you can tell them apart. **Comment** (or ⌘/Ctrl + Enter) posts it. Paste or drop an image into the field to attach it, or use **Attach image** in the task's Attachments section (PNG, JPEG, WebP or GIF, up to 10 MB each; several at once, or drop files on the area). Changes to the task itself (status, due date, priority, assignees) appear between the comments.

You can edit your own comments (the pencil; the edit form looks like the field you wrote it in). You can delete your own; **workspace owners and admins can delete anyone's**. A task shows its newest 100 comments, and **Load earlier comments** appears at the top when there are more. The number of comments shows on the task's card on the board. While a task is open, a rename or a new estimate made by a teammate shows up on its own, unless you are typing in that field at the time.

**Statuses and the board.** Every task sits in a status — a workspace starts with seven: **Backlog → On hold → Pendente → Em progresso → QA → Client review → Closed** (new tasks land in Pendente; Closed is the completed one) — and the **Board** tab shows one column per status. Drag a card between columns, or reorder within one; a drop saves straight away and appears on your teammates' boards within a few seconds. The project rail on the left filters the board the same way it filters every other tab. The chip on each row in the list shows the same status, and clicking it changes it without opening anything.

Only top-level tasks get a card. A parent's checklist rides along as a `2/5` chip rather than filling the column with its own cards.

Marking a task done and dropping it in a **completed** column are the same act: either way the task is closed and stamped with the time, and pulling it back out of that column reopens it. That is what the status *type* means — each column is Not started, Active or Completed, and only the last one closes a task.

**Configuring statuses** (workspace owners and admins). The `⋮` on a column header renames it, recolors it, changes its type, moves it left or right, makes it the column new tasks land in, or archives it. `+ Add status` at the end of the board creates one. Everyone else sees the board and can move cards, but not the menu.

Three things the app won't let you do, because each one breaks something quietly: leave a workspace with no open column (a new task would have nowhere to go) or no completed one (the done checkbox would have nowhere to send a task), give two live columns the same name, or archive a column that still holds tasks without saying where they go.

**The task rail.** In the Timer's calendar and split views (on wider screens) a rail on the right shows what's due today, so you can start or drag straight onto the grid you're tracking into. Collapse it with the control in its header.

## Favorites & recurring entries

- **Continue last** — the ↺ button in the top bar picks up whatever you tracked most recently, with its project, task, tags and billable flag. It's there because three of the five Timer views (calendar, timesheet, planner) show no entry rows, so the per-row **Continue** isn't reachable from them. It only appears when there's something to continue.
- **Favorites** — save a description + project + task + billable combo and start it with one click from the star menu in the top bar.
- **Recurring entries** (Settings → Recurring entries) — templates like "Weekly team sync, Mondays 30 min" that materialize automatically as real entries on schedule, even while you're not in the app. Edit or pause them any time.

## Calendar sync & auto-track (Google + Outlook)

Connect your own **Google Calendar**, **Outlook / Microsoft 365**, or both under **Settings → Calendar sync** (read-only access — the app never writes to your calendar). Connecting both is the normal case when work and personal calendars are separate; their events simply appear together. Your calendar is yours alone: teammates never see its events, and auto-track only creates entries on your timesheet. Once connected:

- Your events appear as dashed **ghost blocks** on the Calendar view. Click one → confirm the project → it becomes a tracked entry.
- **Auto-track** (toggle on the same Settings card): every few minutes, meetings that have *ended* are automatically turned into time entries — no clicking needed. Each event is only ever converted once.
- You can also convert a whole date range at once ("convert visible events").

Declined, cancelled, and all-day events are ignored, and each calendar has its own auto-track switch.

**Work accounts:** many companies require an administrator to approve third-party apps. If Microsoft says "Need admin approval" when you connect, that's your organisation's policy — your IT team has to approve the app before the connection can be made.

See [CALENDAR_SYNC.md](CALENDAR_SYNC.md) for setup details if you self-host.

## The Assistant

The Assistant is built in, reachable from the sparkle button in the top bar, the command palette, or `⌘I` / `Ctrl+I` — the panel opens with the chat input focused and suggestions that follow the page you're on.

**Nudges** — the Assistant watches for things worth acting on and surfaces them as cards (and, optionally, one-time toasts/browser notifications):

- a meeting happening **now** that you're not tracking
- a past meeting today you never tracked (with a one-click **Add to timesheet**)
- a meeting starting soon
- a timer that's been running suspiciously long
- a weekday with nothing tracked
- a budgeted project that's over, or on pace to overrun

Dismissals stick per-device. Turn nudge alerts on/off under Settings → Productivity.

**Chat** — ask the Assistant things in plain language: *"start a timer for the Acme redesign"*, *"how much did I bill this week?"*, *"log 2 hours of code review yesterday afternoon"*, *"track my 10am meeting"*. It can start/stop timers, log and delete entries, track meetings, summarize your time, and look up your projects — anything that **writes or deletes data asks for your approval first** with an in-chat confirm card.

**Memory** — tell the Assistant to remember preferences ("remember that standups are never billable") and it stores them per-workspace, using them in future conversations. Review and delete everything it knows under **Settings → Assistant memory**.

## Reports & exports

The Reports page has three tabs:

- **Summary** — totals (tracked, billable, amount, entries, avg/day), a daily bar chart, a cumulative chart, and a breakdown you can group and sub-group by **project / client / task / tag** — and, for owners and admins, **person** (e.g. client → project, or person → project).
- **Weekly** — hours per day nested under ISO weeks.
- **Detailed** — every entry as a row with project, client, task, tags, duration, and amount.

Everything respects the **date range picker** and filters. Other tools on this page:

- **Rounding** — round durations off / nearest / up / down to a chosen number of minutes. This preference is saved to your account.
- **Export** — CSV, Excel (.xlsx), or print/PDF via the browser's print dialog.
- **Hide amounts** — a switch in the toolbar for a report that goes to a client: it takes money out of the summary tiles, the breakdown, the detailed table, the CSV/Excel export and the printout, and a saved report remembers it.
- **Whose hours** — a member's Reports cover only their own time, whatever filters are sent (the same goes for their Timer, project and client totals, task totals, AI summary, briefing and MCP key). Owners and admins see the whole workspace here and can narrow it with the **Person** filter under Filters.
- **Saved reports** — save the current configuration (range, filters, grouping, rounding) under a name and reload it in one click.
- **AI summary** — draft a client-ready narrative summary of the selected period in a chosen style, from your real entries. Edit before you send it anywhere.
- A full **all-entries CSV export** lives under Settings → Data export.

Amounts come from each project's billing rate; the display currency is set under Settings → Preferences.

## Productivity tools

All under **Settings → Productivity**, all device-local, all off by default:

- **Idle detection** — if you go idle with a timer running, the app asks whether to keep, trim, or discard the idle time. Activity in any of your open sessions counts (other tabs, the PWA, another computer), and only the tab you're looking at will prompt — so working on one device won't trigger idle prompts on another.
- **Not-tracking reminders** — periodic nudge when nothing is running during your workday.
- **Pomodoro** — work/break interval timers layered on top of your tracking.
- **Browser notifications** — used by the above and by the Assistant's nudge alerts (needs one-time permission).

## Teams & sharing a workspace

Under **Settings → Team** you can invite people to your workspace by email. Invitees get an email link; accepting it (after signing up, if needed) joins them to your workspace.

- **Roles:** owner (fixed), admin, member — changeable per member from the same card.
- Everyone in a workspace shares its clients, projects, tasks and tags. **Entries are personal:** each person's Timer shows only their own, a member sees only their own hours everywhere, and owners and admins review the team in Reports. Nobody stops or edits someone else's running timer.
- Pending invites can be cancelled; members can be removed.

## Browser extension

A Chrome (MV3) extension mirrors the timer in your toolbar (starting a timer there asks for a project, listed under its client, just like the app):

- **Badge** shows the running timer's elapsed time at a glance.
- **Popup** — sign in, see the running entry, start/stop.
- On **GitHub, Jira, and Linear** pages, the extension reads the current issue/PR title so a new timer's description is pre-filled with what you're actually working on. It reads nothing else, on no other sites.

Install: load `dist/extension/` unpacked (dev) or via the Chrome Web Store listing. Details in [../extension/README.md](../extension/README.md).

## Integrations (Workfront, Dynamics)

Under **Settings → Integrations** you can connect **Adobe Workfront** or **Microsoft Dynamics** and push time entries into them (for firms where the system of record isn't this app). Each integration has a **Test connection** button; pushes are explicit — nothing syncs without you asking.

Both systems file time against a calendar day rather than a timestamp, and the day used is the one **you** were working in: the push sends your browser's timezone, so an entry tracked at 18:30 is filed on that date, not the next one. Pushing an older backlog is dated by the rule in force back then, so entries either side of a daylight-saving change still land on the right day.

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘K` / `Ctrl+K` | Command palette — start/stop, continue a recent entry, navigate, ask the Assistant |
| `Alt+Shift+S` | Start / stop the timer |
| `Alt+Shift+X` | Discard the running timer |
| `?` | Show the shortcut reference |

The command palette is the fastest path to almost everything — try it first.

## Offline & sync behavior

- The **running timer syncs in real time** across all your open tabs (and the extension) via a WebSocket — start, stop, discard or trim it anywhere and every other tab follows immediately. Timers are personal: a teammate starting or stopping theirs never touches yours.
- **Everything derived from your entries follows too.** A stop in one tab updates Reports, and the tracked totals on Projects and Tasks, in a tab you left open on another screen — no reload, no clicking away and back.
- If the connection drops (laptop asleep, a flaky network), the app reconnects and **re-checks the server** rather than trusting what it last heard, so a tab can't sit showing a timer that stopped somewhere else while it was away.
- If you **go offline**, the timer keeps state locally and your changes are queued in the browser (IndexedDB), then replayed automatically when you're back online. A logged minute is never lost to a bad connection. An edit made offline stays on screen and tells you it's waiting to sync — it isn't reverted and then quietly reapplied later.
- Timer stop is optimistic: totals update instantly, without a visible dip while the server catches up.

## Account & security

Under **Settings → Account / Security / Danger zone**:

- **Profile** — change name, photo, verify email.
- **Passkeys** — sign in with Touch ID / security keys.
- **Connected accounts** — link/unlink Google sign-in.
- **Active sessions** — see and revoke every signed-in session.
- **Deactivate account** — signs you out on every device, blocks sign-in and removes you from your workspaces. Nothing you tracked is deleted: your time, tasks and comments stay, still under your name. Being invited again brings the account back. The only owner of a workspace has to make someone else an owner first.

## Settings reference

| Section | What's there | Where it's stored |
|---|---|---|
| Appearance | Theme (light/dark/system), auto-assign colors + AI recolor | Theme: device · colors: account |
| Keyboard shortcuts | Reference card | — |
| Data export | All-entries CSV | — |
| Preferences | 12/24h time, currency, week start, show weekends | Account |
| Productivity | Notifications, idle detection, reminders, nudge alerts, pomodoro | Device |
| Email digests | Morning briefing, weekly summary, send hour, send one now | Account |
| Assistant memory | Review/delete assistant memories | Account |
| Recurring entries | Manage templates | Account |
| Team | Members, roles, invites | Workspace |
| Calendar sync | Google/Outlook connect/disconnect, auto-track | Account |
| MCP connector | Server URL, API keys (create/revoke) | Workspace |
| Integrations | Workfront / Dynamics | Workspace |
| Account | Profile, email verification | Account |
| Security | Passkeys, connected accounts, sessions | Account |
| Danger zone | Deactivate account | — |

"Account" settings follow you across devices; "device" settings are per-browser.
