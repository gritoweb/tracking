# Architecture (internal)

Deep-dive for people working on the codebase. `CLAUDE.md` is the terse operating manual (commands, conventions, deploy sequence); this doc is the narrative: how a request flows, where state lives, and why the pieces are shaped the way they are.

## System overview

One Cloudflare Worker serves everything: static SPA assets, the REST API, two WebSocket endpoints, scheduled jobs, and outbound email.

```
Browser SPA (React 19) ─┬─ /api/*        → Hono app (REST, workspace-scoped)
Chrome extension ───────┤─ /api/ws       → TimerRoom (timer sync WebSocket)
                        ├─ /agents/*     → ChatAgent DO (Assistant chat, Agents SDK)
                        └─ /*            → static assets (SPA fallback)
Cron (*/5 min) ─────────── scheduled()   → auto-track + recurring materializers
```

- **Runtime:** Cloudflare Workers (`nodejs_compat`), custom domain `tracking.gritoweb.com.br`
- **Data:** Cloudflare D1 (SQLite, direct SQL — no ORM), plus per-DO SQLite for the chat agent
- **Bindings** (`wrangler.jsonc`): `DB` (D1), `TIMER_ROOM` + `CHAT_AGENT` (Durable Objects), `AI` (Workers AI), `EMAIL` (send_email)

## Request lifecycle

`src/worker/index.ts` exports `{ fetch, scheduled }` and both DO classes. The fetch handler branches **before** Hono for `/agents/*`:

1. **`/agents/*`** — authenticates the session, resolves the caller's workspace, then **rewrites the agent-instance segment of the URL to `<workspace id>:<user id>`** before calling `routeAgentRequest` (Agents SDK). This is the isolation guarantee for chat: a client can name any instance it likes; it always lands on its own `ChatAgent` in its own workspace.
2. **Everything else** — the Hono app. `/api/auth/*` goes to the Better Auth handler (with rate limiting on the credential endpoints: a per-isolate count plus a shared Workers Rate Limiting binding, `AUTH_LIMITER`). All other `/api/*` route groups sit behind `middleware/workspace.ts`, which resolves `{ userId, workspaceId }` from the session (cookie or bearer token) and puts them on context. **Every query in every route filters by `workspace_id`** — this is the multi-tenancy model; there is no row-level magic beyond discipline plus the e2e tenant-isolation suite.
3. Non-API paths fall through to static assets with SPA `not_found_handling` (`run_worker_first` covers `/api/*` and `/agents/*`).

### Route groups (`src/worker/routes/`)

| Mount | File | Notes |
|---|---|---|
| `/api/time_entries` | `time-entries.ts` | CRUD, `/current` (running), `/suggestions`, bulk ops, `/:id/stop` |
| `/api/projects` | `projects.ts` | CRUD + `POST /recolor` (AI color assignment) + `GET /pacing` (budget burn/projection). `GET /` takes optional `since`/`until` (both or neither) which scope `trackedSeconds` only; `budgetSeconds` is always all-time so the budget bar can't be scoped out from under its own denominator |
| `/api/clients`, `/api/tags`, `/api/favorites`, `/api/recurring` | one file each | plain CRUD (tags: rename/recolor/delete only — created implicitly via entries) |
| `/api/tasks` | `routes/tasks.ts` | CRUD plus the planning model: due date, priority, fractional `sort_order`, one level of subtasks, and recurrence. Three rules live here, not in the client: a subtask may never be a parent (one level, enforced on create and on re-parent); `tracked_seconds` **rolls subtasks up into the parent**, so a container task isn't reported as zero; and completing a repeating task **spawns the next occurrence inline**, measured from the `completedOn` local date the client sends — the worker runs in UTC and must not derive a due date from its own clock. Recurrence carries forward to the new occurrence and is cleared from the completed one, so reopening and re-ticking can't mint a second copy. `PATCH /:id/move` is the board drop: the target column and the position inside it in **one** write, so a card can never be seen in the right column at the wrong height. |
| `/api/task-statuses` | `routes/task-statuses.ts` | The board's columns, per workspace. Reading is open to every member (a board with no columns renders nothing); creating, renaming, recolouring, retyping, reordering and archiving are **`isManager` only** — moving a card is ordinary work, configuring the workflow is not. Four guards that fail closed: a workspace always keeps at least one non-completed and one completed column, exactly one `is_default` (claiming it clears the previous holder in the same `batch`, and archiving the default passes it on rather than dropping it), two live statuses may not share a name (409), and archiving a status that still holds tasks requires `moveTo` (400 naming the count otherwise). Retyping a column across the completed line re-syncs every task already in it, in both directions. |
| `/api/drafts` | `drafts.ts` | drafted entries awaiting review: `GET ?date=` / `?since&until` (local dates), `POST /generate`, `PATCH /:id`, `POST /confirm` (with optional total reconciliation), `DELETE /:id`, `DELETE ?date=` |
| `/api/reports` | `reports.ts` | `summary`, `grouped` (group→subGroup, incl. `user`), `weekly`, `detailed`; rounding applied in SQL; a member is pinned to their own `user_id` |
| `/api/me` | `me.ts` | the caller's role in the active workspace and `canManage`, only so the UI can hide what the server refuses |
| `/api/saved-reports` | `saved-reports.ts` | per-user saved report configs |
| `/api/planner` | `planner.ts` | per-user planned allocations (project+task per day): `GET ?since&until`, `PUT /` cell upsert (0 deletes), `POST /bulk` (CSV import / copy-week) |
| `/api/settings` | `settings.ts` | per-user prefs stored on the Better Auth `user` row, incl. digest preferences; `POST /digest/send` mails one immediately |
| `/api/keys` | `api-keys.ts` | workspace API keys for MCP/programmatic access — list/create/revoke. Session-only: a credential that can mint credentials must not be reachable from `/mcp` |
| `/api/calendar` | `calendar.ts` | Multi-provider (Google, Microsoft): `GET /:provider/connect`, `GET /:provider/callback`, `DELETE /:provider`, `GET /status` (one row per provider), `GET /events` (merged read-through), `PATCH /auto-track`, `POST /convert` |
| `/api/ai` | `ai.ts` | `POST /quick-entry` (NL→entry), `POST /summary` (AI report draft); rate-limited |
| `/api/assistant` | `assistant.ts` | `GET /nudges`, `POST /track-event`, memory list/delete. **Chat is NOT here** — see the Assistant below |
| `/api/integrations` | `integrations.ts` | Workfront/Dynamics adapters, `POST /push` (takes the client's IANA `timezone`; the route resolves each entry's work date with `lib/local-date.ts` before handing it to an adapter), SSRF-guarded, outbound rate limits |
| `/api/admin` | `admin.ts` | `DELETE /users/:id` (site-admin user removal + orphan cleanup); list/ban/impersonate go through Better Auth's admin plugin client-side |
| `/api/ws` | `websocket.ts` | upgrade → `TimerRoom` (`idFromName(workspaceId)`) |

`/mcp` is **not** a Hono route: like `/agents/*` it is intercepted in `index.ts` before the app, authenticated by API key rather than session, and handed to `agents/mcp`'s `createMcpHandler`. See MCP below.

`db/queries.ts` holds the shared SQL helpers — `ENTRY_SELECT` is the canonical time-entry JOIN; `broadcast()` fans WebSocket events out through the DO; `upsertTags()` implicitly creates tags with deterministic colors.

## Who sees what (`lib/permissions.ts`)

- **Entries are personal; reads of hours are scoped by role.** `entryScopeUserId(role, userId)` is `null` for owner/admin and the caller's id for a member, and every read of tracked time goes through it: `buildReportWhere` (its `scopeUserId` wins over any `userIds` filter), `clients/stats`, project totals (`projectSelect(scoped)`), `tasks.tracked_seconds`, `ai/summary`, the digest and the MCP read tools. `GET /api/time_entries` follows the same scope, so an owner or admin reviews and corrects the team's hours from the Timer list; suggestions stay the caller's own (they answer "what do I usually log"), and `GET /time_entries/:id` 404s for a member on someone else's entry.
- **Budgets are owner/admin only:** `estimatedHours`/`budgetSeconds` are blanked for a member, `GET /projects/pacing` returns `[]`, and `budget_risk` nudges, digest pacing and MCP `get_project_pacing` are skipped or refused.
- **Every entry has an active project; every project an active client.** The shared schemas require `projectId`/`clientId`, and `findActiveProject`/`isActiveClient` reject archived or foreign ids on REST, MCP, recurring templates and `track-event`. Auto-track leaves meetings inference can't place as ghost blocks, the recurring cron skips a template without a project, and drafts can't be confirmed without one.
- **Time entries cannot exist without a project, even from a buggy writer.** Beyond the code checks above, migration `0049` puts two triggers on `time_entries` (`BEFORE INSERT` and `BEFORE UPDATE OF project_id`) that abort a NULL project. Consequence: a project that still has hours cannot be deleted (the `ON DELETE SET NULL` update is refused); the app archives projects, it never deletes them.
- **Task comments:** anyone in the workspace reads and writes them; only the author edits one; the author **or an owner/admin** deletes one (`canDeleteComment`, the same rule as attachments). `GET /tasks/:id/comments` returns the newest `limit` (default 100, max 200) oldest-first and takes `before=<commentId>` to page back; the tie-break is the row's `rowid`, because comments in the same second must keep their order.
- **Workspace-owned, not person-owned:** API keys, tags and favorites belong to the workspace, so any member may create or revoke a key and remove a tag or favorite. A key still *acts* as the person who minted it (a member's key has a member's permissions) and stops working when that person leaves the workspace.
- **Members create, managers change.** Anyone creates a client or a project (`memberProjectInput` drops a member's rate, budget, dates and integration link); editing, archiving and recoloring projects and clients, and integrations CRUD/test, answer 403 `MANAGER_ONLY_ERROR`. `integrations/push` checks `canWriteEntry` per entry.
- The UI mirrors these rules through `GET /api/me` (`hooks/useWorkspaceRole.ts`, `canManage` stays false until known), but a hidden control is never the protection.

## Auth (Better Auth, `src/worker/auth.ts`)

Plugins in play: **email OTP** and **magic link** (the primary passwordless sign-in paths), **bearer** (extension tokens via `set-auth-token` header), **admin** (site-wide `user.role === "admin"`: list/ban/impersonate/remove), **organization** (workspace = organization; owner/admin/member roles, email invites), **passkey**, Google social login. Email/password **sign-in** is a production login method (`ENABLE_PASSWORD_AUTH` is a deployed var); password **sign-up** is compiled out of production builds (`emailAndPassword.disableSignUp: !import.meta.env.DEV`), so the e2e suite and the local seed demo login are its only users. TOTP two-factor was removed along with passwords (Better Auth's enable/disable flow requires the account password); its D1 tables remain but are unused.

Notable decisions:

- `session.freshAge = 0` — otherwise Better Auth's `list-sessions` 403s (`SESSION_NOT_FRESH`) after a day and breaks the Settings sessions card. Freshness is re-imposed selectively on sensitive ops (`update-user`, `unlink-account`).
- Access is invite-only (`lib/invite-only.ts`). `databaseHooks.user.create.before` refuses any new account without a pending, unexpired invitation from a workspace owned by an `ADMIN_EMAILS` address, and `hooks.before` refuses a sign-in code or magic link for such an email before anything is sent (the magic-link verify step can't surface a hook error, and errors thrown inside Better Auth's send callbacks are swallowed). Only an `ADMIN_EMAILS` address may create a workspace through the API (`allowUserToCreateOrganization`); apart from that, only the very first `ADMIN_EMAILS` account, and `@example.com` e2e accounts in dev builds, get one from `user.create.after`. A signed-in user with no workspace sees `NoWorkspacePage` with their pending invitations.
- `trustedOrigins` includes the pinned `chrome-extension://<id>` origin — the extension is trusted by origin, CSRF stays on for the cookie web app (see `extension/SECURITY_AUDIT.md`).
- **Email** goes out through the `EMAIL` send_email binding (MIME built with `mimetext`, from `noreply@gritoweb.com.br`): invites, OTP codes, magic links. Bodies are React Email templates (`src/worker/emails/*.tsx`) rendered on the worker with `render`/`toPlainText` from `react-email`; the plain-text MIME part is derived from the HTML, and `pnpm email:dev` serves a local template preview.
- Better Auth tables use camelCase columns; everything else is snake_case.

## Durable Objects

**`TimerRoom`** (`durable-objects/TimerRoom.ts`) — one per workspace, keyed `idFromName(workspaceId)`. Plain WebSocket room: tabs and the extension connect via `/api/ws`; REST mutations call `broadcast()` with the entry's owner: `timer:start`/`timer:stop` reach only that person's sockets (a running timer is personal), and every other socket gets `entries:changed` with a `null` payload — enough to refetch, never another person's entry. Each socket is tagged with its authenticated `userId` (`serializeAttachment`, forwarded by `routes/websocket.ts` as `X-User-Id`). Two client→server messages: a throttled `{type:"activity"}` heartbeat, relayed as `user_activity` to the same user's *other* sockets so idle detection on their open sessions knows they're active elsewhere (`react-app/lib/activitySync.ts`), and a bare `"ping"` keepalive answered by `setWebSocketAutoResponse` without waking the hibernated object. Events out are `timer:start`, `timer:stop`, `entries:changed`, and `user_activity` — note `entries:changed` is polymorphic (`TimeEntry | null | {source}`), so clients must narrow before treating the payload as an entry. No persistent storage of consequence — D1 is the source of truth; the DO is fan-out.

**`ChatAgent`** (`durable-objects/ChatAgent.ts`) — the Assistant's chat brain, one per workspace member (instance `<workspaceId>:<userId>`), built on the Agents SDK (`agents` + `@cloudflare/ai-chat`, `AIChatAgent` base class). Persists conversation history (capped at 100 messages) and resumable streams in its own DO SQLite. Runs `streamText` over Workers AI (`@cf/meta/llama-4-scout-17b-16e-instruct` via `workers-ai-provider`), max 5 tool steps, 800 output tokens, 4k char input cap, 15 msg/min per-person rate limit. Its tools, grounding context, nudges and memory (`assistant_memory.user_id`) read and write only that person's time.

## The Assistant — three layers

1. **Nudges — deterministic, no AI** (`lib/assistant.ts`). `GET /api/assistant/nudges` computes: meeting happening now, untracked past meeting, meeting soon (all via the same Google Calendar read-through as `routes/calendar.ts`), long-running timer, empty weekday. Dismissals/seen-markers are client-side (`stores/assistantStore.ts`, persisted). `POST /track-event` is the one-click materializer (idempotent on `calendar_event_id`, AI-assisted project inference).
2. **Chat — ChatAgent DO** over `/agents/*` WebSocket. The frontend (`components/assistant/AssistantPanel.tsx`) uses `useAgent({ agent: "chat-agent" })` + `useAgentChat`. Tools (`lib/assistant-tools.ts`): `startTimer`, `stopTimer`, `logTimeEntry`*, `trackMeeting`*, `deleteEntry`*, `getTimeSummary`, `listProjects`, `rememberPreference`*, `searchMemory` — asterisked tools require **human approval** (AI SDK `needsApproval`, surfaced as in-chat confirm cards). Tool writes reuse the same D1 helpers + `broadcast()` as REST. The system prompt treats calendar/entry/memory text as untrusted data (prompt-injection hardening — audit phase 3).
3. **Memory** (`lib/assistant-memory.ts`, `assistant_memory` table) — per-workspace key/content facts, upsert-by-slug, pruned to 200, keyword recall (no embeddings). Reviewable/deletable via Settings and `GET/DELETE /api/assistant/memory`.

## Workers AI (non-chat) — `lib/ai.ts`

`@cf/meta/llama-3.1-8b-instruct-fp8` with `json_schema` response mode for: quick-entry NL parsing, AI summary drafting, and project color assignment. All three are **best-effort enhancements**: outputs are validated (palette membership, grounded project/task matching) and every path has a deterministic fallback — AI is never the only way a feature works.

## Cron (`scheduled()`, every 5 minutes)

Three independent, idempotent jobs, each iterating its own subjects and swallowing per-subject errors so one bad connection or address never blocks the sweep:

- **Calendar auto-track** (`lib/calendar-autotrack.ts`) — for each person with a calendar connected + auto-track on, converts their *ended* events into their own entries. Provider-agnostic (`lib/calendar-connections.ts`); idempotent per person via `time_entries.calendar_event_id` + `user_id`. Recurring templates likewise mint entries for their author (`recurring_entries.user_id`).
- **Recurring entries** (`lib/recurring.ts`) — materializes each active template once its scheduled UTC time passes. Idempotent via `last_materialized` (UTC date). Schedules stored as UTC weekday + minutes-of-day; the client converts to local time (`react-app/lib/recurrence.ts`).
- **Email digests** (`lib/digest.ts`) — the morning briefing and the Monday weekly summary, for users who opted in. The cron has no request to read a timezone from, so it works off `user.digest_tz_offset` (reconciled client-side by `useHydrateSettings` whenever it drifts, so a DST change doesn't send an hour off for months). The 5-minute cron ticks twelve times inside the target hour, so the send is exactly-once by comparing `digest_daily_sent`/`digest_weekly_sent` against the user's **local** date rather than by locking.

## Drafting a day (`lib/drafts.ts`)

Turns the signals the app already holds into proposed entries a person confirms. Three stages, in this order:

1. **Candidates — deterministic.** Calendar events that ended untracked; uncovered stretches inside the day's own working window (busy = tracked entries ∪ all calendar events ∪ outstanding drafts, so a meeting is never proposed twice — once as itself and once as the hole it left); work logged on this weekday in ≥3 of the last 8 weeks. When something happened and how long it lasted are facts, not model output.
2. **One AI call** (`runDayDraftEnrichment` in `lib/ai.ts`) adds a plain-language description and a project, grounded to the workspace's real projects with the same fuzzy-resolution guards as quick-entry.
3. **Validation.** Everything the model returns is checked before storage; any failure keeps the deterministic seed. A gap whose AI step didn't run arrives as a blank slot to fill.

Drafts live in their **own table**, not behind a `status` column on `time_entries`. A draft is a proposal, not time: it must never reach a report, an invoice, a client roll-up, a project total, or an integration push. A status column would put that guarantee in the hands of every query that aggregates entries, forever; a separate table makes it structural. Confirming inserts a real entry and deletes the draft. Regeneration is idempotent by unique index on both `(workspace_id, user_id, calendar_event_id)` and `(workspace_id, user_id, start, stop)`.

`POST /confirm` optionally takes `reportedTotalSeconds` and scales the batch proportionally (`scaleDurations`) — the last step of review, where the day's number is corrected once instead of entry by entry. Scaling moves an entry's **end**, never its start.

## Project pacing (`lib/pacing.ts`)

Deliberately AI-free — pacing goes in front of a client, so it must be reproducible from the entries alone. Per active project: share of budget spent, burn per **working** day over a trailing 14-day window (calendar days understate the rate by ~30% and turn every real overrun into "on track"), working days left to `end_date`, and the projected total at that rate. One computation feeds three surfaces — `GET /api/projects/pacing`, the `budget_risk` assistant nudge, and the emailed digest — so they cannot disagree. A dormant project gets no verdict rather than a fabricated one.

## MCP server (`mcp/server.ts`, `lib/api-keys.ts`)

`/mcp` speaks Streamable HTTP via `agents/mcp`'s `createMcpHandler` — stateless, no Durable Object. A fresh `McpServer` is built per request, bound to the workspace resolved from the API key.

- **64 tools (25 read, 39 write)** from one catalog (`mcp/registry.ts`) that also feeds the in-app Assistant. Most run through `mcp/rest-bridge.ts`, the app's own routers with the key's workspace and person, so a tool gets the screen's validation, role checks and broadcasts. A key acts as the person who created it: a member's key reads only their own hours and no budgets, and `log_time`/`create_project` require an active project/client. Timers are app-only (no start/stop tools). `list_task_comments` returns the newest 100 and takes `limit`/`before` to read further back.
- **No tool takes a workspace id** — it is fixed at construction, so nothing a model can invent reaches a tenant boundary.
- **Write tools are registered only for a `read_write` key.** A read key isn't shown them at all; a tool a client can see but can never call is worse than one never advertised.
- **A gate runs before the key is looked up** (`mcp/gate.ts`, called first in `handleMcpRequest`): a browser `Origin` that is not ours gets 403 (the Streamable HTTP spec's DNS-rebinding defence; MCP clients send none) and a per-address limit of 600 requests a minute (only abuse reaches it; ordinary `/api` routes have no blanket limit at all, only the sensitive endpoints do) answers 429 with `Retry-After` (`MCP_LIMITER`, plus a per-isolate count), so key guessing and floods never reach D1.
- **Auth is a workspace API key** (`tt_live_…`), not a session bearer: only the SHA-256 is stored, the plaintext is shown once and is unrecoverable, and membership is re-verified against `member` on every call (a key outlives the session that minted it).
- **Identity**: `serverInfo` carries `title` "TimeTracker", `websiteUrl`, a description and `icons` pointing at the app's own public assets, so a connector list renders it properly. `name` stays the lowercase wire identifier `timetracker` — clients key config off it. `instructions` carry the operating rules the schemas can't express (pass `timezoneOffsetMinutes`; drafts aren't tracked time; a project with no rate contributes 0 rather than "earned nothing"). Every tool declares `readOnlyHint`/`destructiveHint`/`idempotentHint`/`openWorldHint`.

## Data model (D1)

Migrations live in `migrations/` (append-only; see `CLAUDE.md` for the deploy ordering rule). Core tables: `workspaces`, `clients`, `projects` (rate, budget, color), `task_statuses` (the board's columns: `name`, `color`, `category` — `not_started` | `active` | `completed` — `sort_order` REAL, `archived`, `is_default`; a workspace is seeded with the seven of `DEFAULT_STATUSES`: Backlog / On hold / Pendente / Em progresso / QA / Client review / Closed), `tasks` (`due_date` is a **local `YYYY-MM-DD`**, not a timestamp — a due date is a day; `priority` 1–4 defaulting to 4; `sort_order` REAL for fractional-index drags **in the list**; `board_order` REAL for the position **inside a board column**, deliberately a second number so tidying the board can't reshuffle "Sort: Plan order"; `status_id`; self-referencing `parent_id`; `completed_at`; `recur_rule`), `time_entries` (+ `calendar_event_id`), `tags` + `time_entry_tags` (tag colors), `favorites`, `recurring_entries`, `saved_reports`, `project_allocations` (per-user planned hours; `task_id` uses `''` for "no task" so the 5-column UNIQUE supports `ON CONFLICT` upserts), `integrations` (encrypted tokens — AES-GCM keyed by `AUTH_SECRET`, `lib/crypto.ts`), `assistant_memory`, `draft_entries` (proposals awaiting review — never aggregated anywhere), `api_keys` (SHA-256 only), plus the Better Auth tables (user/session/account/organization/invitation/twoFactor/passkey).

**Two integrity rules live in the database itself:** `0049` refuses a time entry with no project (see above) and `0050` makes `(organizationId, userId)` unique in `member`, so a person is a member of a workspace once (a repeated `INSERT OR IGNORE` from the seed is now a no-op instead of a second row).

**Seed data is not a migration.** `seeds/dev-seed.sql` is local-only (`npx wrangler d1 execute time-tracker --local --file=seeds/dev-seed.sql`); migrations 0005/0006 were retroactively no-op'd so remote applies can never seed demo credentials into prod.

## Frontend (`src/react-app/`)

- **Server state:** TanStack Query via the typed client in `lib/api.ts`. Mutations broadcast through the DO; other tabs invalidate on WebSocket events. Each tab stamps requests with a per-page `X-Client-Id` (`lib/api.ts` `CLIENT_ID`), which `broadcast()` echoes back as the message's `origin` so the originating tab skips the invalidate for its own write — it already has the result — instead of refetching the list twice per edit.
- **One invalidation set for entry changes:** `invalidateEntryDerived()` (`hooks/useEntries.ts`) is the single list of what an entry change makes stale — `time-entries`, `reports`, and `projects`/`tasks` (both carry a `trackedSeconds` summed server-side from entries). Every producer goes through it: local mutations, the socket handler, and the reconnect resync. The socket used to invalidate `time-entries` alone, which left Reports stale in every other tab and the tracked totals stale in *all* of them. `entry-suggestions` — now read only by the timer bar's **Continue** button, since the description field carries no autocomplete — stays opt-in behind a flag and sits outside the `time-entries` prefix, so the running timer's debounced description saves don't refetch it every few keystrokes.
- **The running timer is reconciled, not just messaged.** `timerStore.setFromWS` treats an entry carrying a `stop` as a clear, because not every stop arrives as `timer:stop` — trimming idle time and the edit sheet both close a timer through `PUT /:id`, which broadcasts `entries:changed` with the now-stopped row. An `entries:changed` with no entry in it (delete, discard, bulk) re-verifies against `/current` rather than being ignored. Both used to leave other tabs counting an entry the server had already closed or deleted. `useWebSocket` also resyncs on *re*connect — nothing replays what was missed while the socket was down, and `refetchOnWindowFocus` repairs the queries but never the Zustand timer — and sends the `"ping"` the room's auto-response pair was always built for.
- **Entry list row identity:** rows are keyed by `DescriptionGroup.anchorId` (the group's earliest entry id), never by the description+project `key`. Keying by editable content meant an inline rename changed the key mid-mutation: the row unmounted on the optimistic patch, replaying its entrance animation and dropping the per-mutation callbacks that raise the "saved" tick and close the edit sheet. For the same reason the edit sheet is hosted by `EntryList` (driven by `uiStore.editEntryId`), not by the row it edits.
- **Local state:** Zustand — `timerStore` (running timer), `uiStore` (view prefs, calendar prefs, productivity settings), `assistantStore` (nudge dismissals, alert toggle). Device-local by design; account-level prefs go through `/api/settings`.
- **Offline:** `lib/idb.ts` + `useOfflineSync` queue mutations in IndexedDB and replay on reconnect; timer state is cached so a refresh offline doesn't lose the running timer. A queued mutation rejects with `ApiError { queued: true }`, which entry mutations treat as "not yet" rather than "failed" — the optimistic value stays on screen instead of rolling back under a failure toast and then silently reappearing when the queue drains.
- **Entry range validation:** `PUT /api/time_entries/:id` re-reads the stored `start`/`stop` and validates the *merged* range, because `UpdateTimeEntrySchema`'s refine can only compare fields present in the body and every inline edit sends one field. Inverted (`stop < start`) is rejected; zero-length is allowed on update — creating one is blocked, but one that already exists must stay editable.
- **Every entry is born billable.** `time_entries.billable` is the only column reports read to compute both billable seconds and invoiced amount (`reports.ts`), and nothing derives it from the project at read time — `projects.billable` is no longer read by any entry-creation path (calendar auto-track, recurring entries, favorites, drafts, quick entry, the timer bar). `resolveEntryBillable` (`@shared/billable`, `DEFAULT_ENTRY_BILLABLE = true`) is the single place this default lives: an explicit `true`/`false` from the caller always wins, anything else resolves to `true`. `CreateTimeEntrySchema.billable` stays `.optional()` (not `.default()`) so the server can still tell "the caller said nothing" from "the caller said no". `projects.billable` remains a DB column (no migration) but is otherwise dead — `ProjectForm` no longer exposes it.
- **Optimistic stop:** `useTimer.ts` patches the entry to completed in the Query cache *before* clearing the timer so day totals never visibly dip. Optimistic writes only insert into cached ranges that actually contain the entry (`rangeContains`, mirroring the list endpoint's `start >= since AND start < until`) — a row no refetch will return is worse than a late one, because it disappears on the next invalidate.
- **Dates are local, and "now" moves:** every rendered day key goes through `localDayKey()` (`lib/dateUtils.ts`), never `iso.slice(0, 10)` — the API returns UTC instants, so slicing buckets an 18:00 entry into tomorrow west of Greenwich. Anything resolved against "now" (`resolveListRange` presets, the grid anchor, the rolling `useEntries` window) is keyed to `useDayRollover()`, which re-renders at local midnight and on visibility/focus: a tab is routinely open across midnight, and a range resolved once at mount goes on querying yesterday.
- **Styles are split by subject:** `css/app.css` only lists the imports, in order; `css/global/` holds the theme (`theme.css`), tokens (`variables.css`), base layer, utilities, keyframes, print and the reduced-motion rule (`accessibility.css`, last on purpose), and `css/components/` the swatch, interaction, rich-text and FullCalendar rules. `fullcalendar.css` stays a lazy import of `CalendarBody`, so it remains its own chunk.
- **Patterns named once:** `Button variant="ghost-destructive"` (a quiet control that only turns red on hover), `Input variant="bare"` (no fill or border, dark theme included), `CenteredPage`, `ReportFigure` and `SettingsHint`.
- **Mentions:** a comment's `@` list opens beside the caret (`lib/caret.ts`); a description's chip shows the person's current name, matched by id (`lib/mentionLabels.ts`); a task title is plain text, so a repeated name there resolves to the first person.
- **Timer workspace:** `pages/TimerWorkspace.tsx` — five views (list/calendar/split/timesheet/planner) behind one header; `lib/calendarMapping.ts` renders two event kinds on one grid (real entries, Google ghosts). `/calendar` redirects here.
- **Global chrome:** `AppShell` mounts the sidebar, command palette (⌘K), keyboard shortcuts, Assistant panel + nudge notifier, and `ProductivityManager` (idle detection, reminders, pomodoro).

Design tokens and conventions live in `DESIGN.md` / `PRODUCT.md` — read those before touching UI; they encode decisions (soft-tone ramp, one-accent rule, icon-button size tokens) that aren't recoverable from the code.

## Browser extension (`extension/`)

Separate Vite build. Popup authenticates with the standard Better Auth client + `bearer()` plugin; token lives in `chrome.storage.local`; the background service worker polls the running timer for the toolbar badge and clears the token on 401 (no refresh flow). Trusted server-side by pinned origin; API base URL is allow-listed. Full model: `extension/README.md`, `extension/SECURITY_AUDIT.md`, `extension/PUBLISHING.md`.

## Security posture (audit history)

Four hardening passes landed as PRs #64–#67 (see git history): cross-tenant IDOR closure on read-backs/tag writes/token cache; SPA headers + prod seed removal + re-gated sensitive auth ops; assistant prompt-injection/tool-abuse/cost-abuse hardening; SSRF guard + outbound rate limits + OAuth workspace binding + extension token clearing. The extension had its own audit (`extension/SECURITY_AUDIT.md`). 

A fifth pass (September 2026, on the `refactor` branch) closed what the audit still had open:

- **Shared request limits.** The limiter was a `Map` per isolate. `rateLimit` now also asks a Workers Rate Limiting binding (`AUTH_LIMITER` 10/min, `AI_LIMITER` 20/min, `MCP_LIMITER` 600/min; declared under `ratelimits` in `wrangler.jsonc`, with `namespace_id`s that must be unique in the whole Cloudflare account; the numbers live once in code, in `SHARED_LIMITS`, and a test holds the wrangler file to them). The counter is per location and, by Cloudflare's own description, permissive and eventually consistent: it slows abuse, it is not exact accounting. A failing binding falls back to the local count with a warning. Off in the dev server.
- **`/mcp` is gated before the database** (Origin check + per-address limit), see the MCP section.
- **CORS** no longer answers `*` when a request has no `Origin`.
- **SSRF guard.** IPv6 is an allow-list (global unicast only, minus the ranges that embed an IPv4 address), which closes `[::ffff:a9fe:a9fe]` (the metadata address) and the other mapped forms; pushes to Workfront/Dynamics use `fetchWithoutRedirect`, so a 3xx cannot send the credentials somewhere the base URL did not name. Not closable in a Worker: a public hostname that resolves to a private address (there is no DNS lookup to check it against), which is why integration URLs stay owner/admin-only.
- **Calendar OAuth state cookie** is `__Host-` prefixed over https, so a sibling subdomain of the parent domain cannot plant it.
- **Attachment downloads** send `Content-Disposition: inline` with a sanitized filename.
- `pnpm audit` (production and dev) found nothing, and no `tt_live_` key or other secret shape is in the git history.

## Testing & CI

**Vitest** (`pnpm exec vitest run`, ~800 tests) is the suite CI runs: `tsc -b`, lint, build, then vitest with coverage (floor 44% lines / 41% branches, counting `lib`, `middleware`, `integrations`, `routes`, `db`, `shared` and the client `lib`). Route tests run against a **real SQLite**: `src/test/sqlite-d1.ts` applies every migration to an in-memory `node:sqlite` database behind the slice of the D1 API the worker uses, and `src/test/route-harness.ts` mounts a router as one person in one workspace, so a test checks the real SQL, the real role rules and the real cross-workspace isolation instead of the text of a query. `src/test/d1-stub.ts` (a recorder with canned answers) remains for the older tests. A test that runs the repo's own ESLint config on snippets keeps the swallowed-error rules from quietly stopping.

**Playwright e2e** (`e2e/`, run with `pnpm test:e2e` against `pnpm dev`) is **not in CI** (removed on 2026-09-18: it stalled and cost minutes per push) — run it locally when a change touches a flow it covers, and move flows into vitest as they are touched. Local port conflict tip and the deploy sequence: `CLAUDE.md`.

## Documentation map

| Doc | Audience | Contents |
|---|---|---|
| `README.md` | anyone | overview, features, dev setup |
| `docs/RELEASE_1.0.0.md` | operators | what 1.0.0 changes, known limits, and the order to deploy it |
| `CLAUDE.md` | agents/devs | commands, conventions, deploy sequence |
| `docs/ARCHITECTURE.md` | devs | this file |
| `docs/USER_GUIDE.md` | end users | every feature, by task |
| `docs/CALENDAR_SYNC.md` | devs/self-hosters | Google Calendar setup + sync/auto-track design |
| `docs/MCP.md` | users/devs | MCP connector: API keys, per-client setup, tool reference, troubleshooting |
| `PRODUCT.md` / `DESIGN.md` | design work | product register, design system (source of truth for UI) |
| `ROADMAP.md` | devs | deferred/planned work |
| `extension/*.md` | devs/publishers | extension architecture, security audit, store publishing, privacy policy |
