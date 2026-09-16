# Changelog

## 2026-09-16 (2)
### Added
- **Drag a task card from anywhere on it, not a dedicated handle.** The card itself is the drag
  surface now (`role: "group"` on `useSortable`, since it wraps two real buttons); a plain click
  still opens the task or starts its timer, via the pointer sensor's activation distance.
- **Board and List are two views of the same data; Today/Upcoming are a filter, not a third view.**
  A `SegmentedControl` toggles Board/List, and a "Due" dropdown (All dates/Today/Upcoming) narrows
  either one — including through the project rail's filter. `TaskViewTabs` is retired.
### Fixed
- **Dragging up, or fast, sometimes didn't register.** Collision detection was `closestCorners`
  alone, which can misjudge near a card's edge on a quick upward flick. It's now `pointerWithin`
  with a `rectIntersection` fallback, and cross-column moves are live-spliced during the drag
  (`onDragOver`) instead of computed after the fact — the card visibly follows the drop as you
  drag it, the way a board like this should feel.
- **A completed drag animated back to its old spot before snapping to the new one.** The
  `DragOverlay`'s own drop animation samples the real list's current position at the moment of
  release; clearing the local drag state in the same tick raced that sample. It now clears two
  animation frames later, once the drop has settled.

Verified: `pnpm check` exit 0, `pnpm lint` 0 errors, `task-board` + `task-planning` +
`task-log-time` 20/20 (plus a manual upward and cross-column drag), `report-per-person` +
`project-required` + `drafts-review` + `tier2-features` 18/19 (the one failure is
`tier2-features`' pre-existing "gaps toggle" spec, unrelated to Tasks).

## 2026-09-16 (1)
### Added
- **Tasks opens on a Board, with a project rail on the left.** Projects grouped by client in a
  left rail that filters Board/List/Today/Upcoming alike, Board leading as the default tab (the
  old "All" tab is relabelled "List", same data). Default status colors now pull from the shared
  swatch palette (`@shared/colors`) by name instead of duplicating hex literals.
  Verified: `pnpm check` exit 0, `pnpm lint` 0 errors, `task-board` + `task-planning` +
  `task-log-time` 40/40, `report-per-person` 5/5.

## 2026-09-15 (15)
### Added
- **Task statuses are configurable, and the board built on them.** A task used to be open or done and
  nothing else, so "in progress" and "waiting on the client" had nowhere to live — and the list's
  existing `Group: Status` rendered exactly two buckets. A workspace now owns a `task_statuses` table,
  seeded with **Backlog → To do → In progress → Feedback → Done**, and a new **Board** view sits beside
  Today / Upcoming / All with a column per status and drag-and-drop (`@dnd-kit`) between and within
  them. Capture lands in the column marked default (To do out of the box), not the first one. Moves
  reach other members live over the existing `TimerRoom` socket.
  **The status is the source of truth and `active`/`completed_at` are its mirror**, written together
  from the status category in one helper (`worker/lib/task-statuses.ts`). That is what keeps every
  existing reader of `tasks.active` correct without touching it: the AI grounding query, the Timer's
  task rail, the subtask rollup counts and the recurrence spawn. Both doors — the row checkbox and a
  board drop — go through that helper, so a task's column and its done flag cannot disagree.
  Ordering inside a column is a new `board_order`, deliberately **not** the list's `sort_order`: one
  number shared between the two surfaces would make tidying the board silently reshuffle
  "Sort: Plan order" over in the list.
  Configuring statuses (rename, recolor, retype, reorder, make default, archive) is owner/admin only
  and lives in the column's own `⋮` menu; *moving* a card is ordinary work and any member can do it.
  The server refuses, not just the screen: a workspace always keeps one open and one completed column
  and exactly one default, two live statuses may not share a name, archiving a status that still holds
  tasks must name where they go, and retyping a column carries the tasks already in it across the
  done line in both directions.
  Verified: `pnpm check` exit 0 (typecheck + build + wrangler dry-run), `pnpm lint` 0 errors,
  `task-board` 12/12 — including a **keyboard** drag (Space, arrows, Space), a member getting 403 on
  every configuration route while still moving cards, and a move on one person's board appearing on
  another's without a reload — plus `task-planning` and `task-log-time` 8/8. Migration `0038` applied
  to the **local** D1 only: 125 existing tasks backfilled, none left without a status, none with the
  mirror out of step.

## 2026-09-15 (14)
### Changed
- **The app's domain is configuration, not code.** It had been a TypeScript constant — better than the
  fifteen copies before it, but still a code edit (and a redeploy of the SPA) to change. The worker
  reads `APP_URL` from the environment (`wrangler.jsonc` vars for deploys, `.dev.vars` locally) via
  `lib/app-url.ts`, which **throws** if it is unset rather than guessing; the SPA and the extension
  read `VITE_APP_URL` from `.env` at build time. Email templates now take the URL as a prop, so the
  worker passes the environment's value and `pnpm email:dev` passes its own — the templates stopped
  knowing the domain at all. CORS resolves its allow-list per request from `c.env`, since middleware
  has no module-level env. `extension/manifest.json` keeps the literal host: Chrome requires
  `host_permissions` to be static.
  Verified: `pnpm build` and `pnpm build:ext` exit 0, `pnpm lint` 0 errors, 14 e2e green across `mcp`
  (which asserts the advertised site and icon URLs), `invite-only` and `report-per-person`. CI and
  `.dev.vars.example` carry the new variable, so a fresh checkout starts.

## 2026-09-15 (13)
### Changed
- **The app's domain lives in one place.** It had been written into fifteen files — the email
  wordmark and footer, three email subjects, the invitation and magic-link copy, the digest's link,
  the MCP `websiteUrl` and its three icon URLs, the CORS allow-list, Better Auth's trusted origin, the
  Admin page blurb and the extension's default API URL, allow-list check and error text. Changing it
  meant a grep, and the last change had left the old domain behind in exactly that way.
  `src/shared/app.ts` now holds `APP_URL`/`APP_HOST` plus `appUrl(env)`, which prefers a deployed
  `APP_URL` var (added to `wrangler.jsonc`, typed through `wrangler types`) over the constant — so a
  staging deploy answers on its own domain without a code change. Everything imports from there,
  including the extension, whose bundler already aliased `@shared` and whose TS project now does too.
  The links *inside* email were already dynamic (built from the request origin), and
  `extension/manifest.json` keeps the literal host, since JSON can't import.
  Verified: `pnpm build` and `pnpm build:ext` exit 0, `pnpm lint` 0 errors, `mcp` 3/3 (it asserts the
  site and icon URLs), `invite-only`, `report-per-person` and `timer-per-user` green.

## 2026-09-15 (12)
### Fixed
- **Every surface now says the domain the app actually runs on.** Transactional email still signed off
  as the old project's domain — "Sent by …", the header wordmark, the invitation and magic-link copy —
  and so did the MCP connector's `websiteUrl` and its icon URLs, the CORS allow-list, the Admin page
  blurb, the extension's content script and its error text, and every doc. All of it points at the
  live domain now; the sender address was already on the company domain.
  Verified: `pnpm build` exit 0, `pnpm lint` 0 errors, `mcp` 3/3 (the spec asserts both the site URL
  and that every icon URL is absolute on that domain — and all three icons answer 200 there),
  `invite-only` and `contrast` green.

## 2026-09-15 (11)
### Fixed
- **The Timer list follows the role again, as the card asks.** D3 says a *member* sees only their own
  hours — in reports, in the Timer list and calendar, in `GET /api/time_entries`, in the MCP and the
  Assistant — while an owner or admin sees everyone's. The list had been hard-scoped to the caller for
  every role, which is stricter than that: an owner could not see, let alone correct, an hour logged
  by someone else, even though the server has always allowed a manager to edit a *completed* entry of
  another (a running one stays its owner's alone). `GET /api/time_entries` now runs through
  `entryScopeUserId` like every other read of hours, so the Timer list is the workspace for a manager
  and the caller's own for a member. Reports and the MCP already behaved this way; suggestions stay
  personal, since they answer "what do I usually log".
  Verified: `pnpm build` exit 0, `pnpm lint` 0 errors, `report-per-person` 5/5 — including an owner
  reading a teammate's entry from the Timer list — plus `timer-per-user`, `project-required` and
  `mcp` green. Also fixed a leftover from the palette move: `e2e/contrast.spec.ts` still imported
  `PROJECT_COLORS`, which broke that spec's module load.

## 2026-09-15 (10)
### Fixed
- **Deploying now builds first.** Workers Builds runs a bare `wrangler deploy` with no build step,
  and the client bundle is produced by `vite build` (the `@cloudflare/vite-plugin` writes both
  `dist/client` and the generated `dist/tracking/wrangler.json` the deploy redirects to) — so the
  pipeline failed with *the directory specified by the "assets.directory" field does not exist*. The
  repo's own `deploy` script is now `pnpm build && wrangler deploy`, so it can never publish a stale
  or missing bundle. The hosted pipeline still needs its command pointed at that script (or a build
  command added) in the Workers Builds settings — a dashboard field, not something the repo can set.
  Verified: with `dist/` and `.wrangler/deploy/` deleted, `pnpm build` then `wrangler deploy --dry-run`
  completes.

### Changed
- **Repository scrubbed of personal and operational data, for going public.** Deploy Version IDs and
  the D1 restore bookmarks came out of this file; the dev seed's demo login, which carried a real
  person's address and name from the upstream project, is now `demo@example.com` / `DemoPassword2026`
  with a freshly generated Better Auth scrypt hash — verified by applying the seed to a local D1 and
  signing in through the API (200 with the new password, 401 with a wrong one).

## 2026-09-15 (9) — production rollout
### Changed
- **D1, D2 and D3 are live.** The working branch fast-forwarded into `master` (21 commits),
  migrations `0035` (per-user running-timer index), `0036` (per-person assistant memory) and `0037`
  (authors on recurring templates and calendar connections) applied to the remote D1, `pnpm check`
  clean, worker deployed, and the site smoke-checked (`200` on the app, `401` on the API without a
  session). `ADMIN_EMAILS` is set as a secret: from here only an address on that list can create a
  workspace, and only an invited email can create an account at all.
- **Production was trimmed to a single workspace.** Invite-only access makes the personal workspace
  that every signup used to get meaningless, so the leftovers from the open-signup period were
  removed — one carrying three throwaway entries, one ownerless legacy row, and three empty personal
  workspaces whose owners keep their access as members of the remaining workspace. Deletion went
  table by table (the thirteen carrying `workspace_id`, plus `member`, `invitation`, the
  `time_entry_tags` join and the stale `activeOrganizationId` / `last_active_organization_id`
  pointers) rather than trusting cascades, and the accounts left without any workspace were deleted
  the same way across the Better Auth tables. Verified afterwards: one workspace, intact, and zero
  orphan rows across entries, projects, clients, tags, members, invitations, accounts and sessions.
  A D1 time-travel bookmark was taken immediately before each deletion; it and the account-level
  detail live in the team's private notes, not here.

## 2026-09-15 (8)
### Fixed
- **Blocks stopped covering the hours underneath them.** Two changes from earlier today combined
  badly: a 22px floor on short blocks stretched a five-minute entry to the height of fifteen, and the
  staggered overlap drew a later block at full width over the one still running — so a 10:00–10:05
  entry hid the middle of a 09:30–10:30 one. The floor is gone (a five-minute entry measures 14px
  again, the height its duration earns) and overlapping blocks split the column again
  (`slotEventOverlap: false`), which is the only arrangement that never hides an entry: measured on
  the same day, 09:30–10:30 now renders in full beside the short ones, and an entry that shares its
  time with nothing still spans the whole column (130px of 134px).
  The cost, deliberately accepted: a block keeps half the column for its whole length once it shares
  a minute with another, so it looks narrow in the stretch where it runs alone. Hiding tracked hours
  is the worse failure of the two.
  Verified: `pnpm build` exit 0, `pnpm lint` 0 errors, 10 passing across the calendar, density,
  day-rollover and tag specs (the `tier2-features` gaps toggle is the pre-existing failure).

## 2026-09-15 (7)
### Removed
- **The description field no longer suggests anything.** Typing dropped a list of past descriptions
  over the form, and picking one rewrote project, task, billable and tags in one go — more than the
  field was asked to do. Both the timer bar and the entry form are now a plain input and textarea.
  `GET /api/time_entries/suggestions` **stays**: the timer bar's **Continue** button reads it to
  offer the last thing tracked, which is the deliberate way to repeat an entry. Gone with it:
  `DescriptionAutocomplete`, its ranking helper, and the specs that drove the dropdown (the tag
  colour tests moved to `e2e/tag-colors.spec.ts`).

### Changed
- **Overlapping calendar blocks stack instead of splitting the column.** With
  `slotEventOverlap: false`, one shared minute cost a block half the column *for its whole length* —
  an entry running 08:00–10:15 sat at half width even in the hour it ran alone, which reads as
  lopsided. FullCalendar's stagger is back on: measured in a 134px column, the 08:00–10:15 block now
  spans the full 130px and the entries overlapping it sit offset on top, exactly as Google Calendar
  draws them.
- **The range you drag to create reads white.** It wears FullCalendar's own solid blue, on which the
  app's near-black event ink was barely legible in light mode; the mirror is tagged `tt-event-select`
  in `eventClassNames` and its text is white in both themes.
  Verified: `pnpm build` exit 0, `pnpm lint` 0 errors, 14 passing across the tag, resume, manual
  entry, calendar, hotkey, favourites and day-rollover specs — the 5 failures are the pre-existing
  `entry-inline-edit` ones.

## 2026-09-15 (6)
### Fixed
- **A tag now shows its own colour the moment you add it, like a project does.** The asymmetry had a
  cause: the project picker *creates* the project (the server answers with its colour), while a tag
  only came into existence when the entry was saved — so the chip in the form had no row to read and
  fell back to the untinted swatch, and the colour only appeared once the list refetched. `POST
  /api/tags` creates the tag as it is added (idempotent on the name), so the chip carries the real
  colour straight away and recolouring works without saving anything first.
- **The swatch inside the recolour button had collapsed to nothing.** Wrapping the dot in a button
  took it out of the badge's flex row, and an inline `span` ignores Tailwind's width and height — so
  the chip rendered with the colour set and no dot to show it. The wrapper is `inline-flex`.

### Changed
- **One palette and one colouring rule for the whole app.** The swatch list, the distinct ordering and
  "pick the colour this workspace isn't using" existed twice — `worker/lib/colors.ts` and
  `react-app/lib/colorUtils.ts` — which is exactly how a picker's preview and the row the server
  writes drift apart. Both now import `src/shared/colors.ts` (`SWATCH_COLORS`, `DISTINCT_COLORS`,
  `nextUnusedColor`, `randomColor`, `spreadColor`); the worker copy is deleted and the client file
  keeps only what is genuinely client-side (contrast and rgba helpers). Tag chips render through the
  same `ColorDot` component the projects use.
  Verified: `pnpm build` exit 0, `pnpm lint` 0 errors, 4/4 in `suggestion-tags` (including a new test
  that the chip's swatch is a real colour *before* the entry is saved) and 18 passing across the
  colour, entry and project specs — the 6 failures are the pre-existing `entry-inline-edit` and
  `tier2-features` gaps ones. Measured in the browser: three tags added in a row come out red, blue
  and green at 10×10px.

## 2026-09-15 (5)
### Fixed
- **A tag stayed grey until the page was reloaded.** Tags are minted server-side when an entry that
  names them is saved (`upsertTags`), but `invalidateEntryDerived` refreshed entries, reports,
  projects and tasks and not the tag list — which the name→colour map is built from and which holds
  a 5-minute `staleTime`. Every freshly created tag therefore rendered in the `#64748b` fallback grey
  on the entry row, the timer bar and the calendar until a reload or five minutes passed. The tag
  query is invalidated with the rest, so it covers every write path at once: create, edit, bulk edit,
  delete, the timer's own start/stop and the WebSocket echo. Covered by an e2e that creates the tag
  through the Add-entry form and fails on the fallback grey without the fix.

### Changed
- **A five-minute entry is now big enough to click.** A short block was drawn a few pixels tall —
  hard to hit at all, and harder to right-click for its menu; time-grid blocks now have a 22px floor,
  so 5, 10 and 15-minute entries all render as one comfortable line (measured 21px against a 43px
  half-hour), and the overflow sits under whatever follows, which is empty time in the case that
  matters.
  Verified: `pnpm build` exit 0, `pnpm lint` 0 errors, and the tag, suggestion, calendar, draft,
  manual-entry and autocomplete specs pass (17/18 — the odd one out is the pre-existing
  `tier2-features` gaps toggle).

## 2026-09-15 (4)
### Fixed
- **Nothing opens a picker at you any more.** Starting a timer without a project popped the project
  picker over the bar, and the description field opened its suggestion list on *focus* — which the
  New-entry sheet and the edit form both trigger by autofocusing it, so a dropdown greeted you on top
  of the form you came to fill. The timer bar now remembers the last project used (`lastProjectId`,
  persisted in `uiStore`) and starts on it; with no project at all the Start button is disabled and
  says "Choose a project to start", and a favourite, task or `Alt+Shift+S` start says the same in a
  toast and waits for a pick rather than taking the screen. The suggestion list opens when you type
  or press ArrowDown, never on focus alone.
- **Demoting yourself no longer needs a reload.** The caller's role is cached (`GET /api/me`,
  60s), and changing a role in Settings → Team invalidated only the organization query — so an admin
  who made themselves a member kept seeing the manager-only controls (the project row's "…" menu,
  Edit/Archive, budgets) until F5. The role and member queries are now invalidated with it. Covered
  by an e2e that fails without the fix.
- **A new project is no longer always the same blue, and neither are tags.** With "Auto-assign
  colors" off, both the quick create and the project form fell back to one fixed palette entry;
  they now take a random one. Tag colours came from a hash of the tag name, which packs short words
  into the same few blues — a new tag now takes the first palette colour the workspace isn't using,
  and a random one once they're all taken.

### Changed
- **Calendar blocks sit square in their column.** FullCalendar's own gutter is 2px on the left and
  2.5% on the right, so a day column left a widening empty strip down its right edge; both sides now
  read as 3px, and two, three or four overlapping entries split the column in equal shares (measured:
  65/65, 43/43/43, 33/33/33/33 in a 134px column). The drag and resize preview used to be drawn at
  full column width straight over the blocks beside it — `CalendarView` now pins it to the share the
  dragged block itself holds (measured: 43px, aligned to the block it came from).
  Verified: `pnpm build` exit 0, `pnpm lint` 0 errors, and the calendar, timer, favourites,
  suggestion, report and project-rule specs pass (the pre-existing `tier2-features` gaps-toggle
  failure aside); the picker, drag preview and both entry forms were checked on screen.

## 2026-09-15 (3)
### Fixed
- **The project-with-a-client rule reached three paths that were still deciding on their own.**
  The audit of every way time can be written found the rule enforced at the REST entry routes, the
  recurring routes and the MCP `log_time`/`start_timer`, and missing in three places that query
  projects themselves: `loadGroundingProjects` (`lib/ai.ts`) listed every active project with no
  regard for its client, which is the list the Assistant matches a spoken project name against, the
  one AI Quick Add resolves through, the one day-drafting proposes from, and the one calendar
  auto-track infers meetings into — so a pre-client project could still take time through any of
  them; and `POST /drafts/confirm` re-checked `active = 1` in its own batch query without the client.
  Both now require `client_id IS NOT NULL`, so the rule holds at the timer bar, the API, the MCP, the
  Assistant, Quick Add, drafts, recurring templates and the calendar alike. Deleting a client was
  checked too and is safe: the route archives rather than deletes, so the schema's
  `ON DELETE SET NULL` never fires and no project loses its client behind the app's back.
- **The MCP asks instead of assuming.** Its refusals named `list_projects` but left the model free to
  pick a project or invent a client to satisfy the call. The server instructions now say to ask the
  person and wait, the refusal texts repeat it at the point of failure (so a model that skipped the
  instructions still can't choose quietly), `start_timer`'s description no longer reads as if the
  project were optional, and `list_projects` marks a pre-client project with `needsClient: true`
  rather than leaving a model to discover it by being refused.
  Verified: `pnpm build` exit 0, `pnpm lint` 0 errors, 20/20 across `project-required`, `assistant`,
  `drafts-review`, `calendar-create`, `calendar-providers`, `mcp` and `description-autocomplete`,
  including a new test that asserts the refusal text sends the model back to the person.

## 2026-09-15 (2)
### Changed
- **The client is created where the hours are logged, and no project takes time without one.**
  Creating a project from the picker asked for a client in a select squeezed between the search box
  and the list, and a workspace with no clients yet got "Add a client under Clients first" — sending
  someone who is mid-entry to another screen. Choosing "Create <name>…" now opens a panel inside the
  picker with a labelled **Project name** and **Client** field, where the client is either picked or
  named on the spot and created with the project; the same field (`components/projects/ClientField`
  plus the pure helpers in `lib/clientChoice.ts`) replaced the dead-end in the full project form, so
  both places behave alike. The project form and the picker use the ordinary primary button for the
  action, and a client name that already exists selects that client instead of minting a duplicate.
  The rule itself got stricter rather than looser: `findActiveProject` now also requires the project
  to have a client, so an entry, recurring template, draft confirmation, calendar conversion or MCP
  log against a pre-client project is refused with one shared message (`PROJECT_REQUIRED_ERROR`).
  Such a project reads "Needs a client" in the picker and opens a **Link a client** panel that fills
  it in before selecting it — a member may fill that one blank field while it is blank (otherwise
  they are stuck mid-entry with no way to fix it), while moving a client that is already set stays
  owner/admin-only.
  Verified: `pnpm build` exit 0, `pnpm lint` 0 errors, and 39/39 across the picker's neighbours
  (`project-required`, `report-per-person`, `manual-entry`, `calendar-create`, `feature-ports`,
  `timer-billable`, `drafts-review`, `clients`, `task-log-time`, `timer-per-user`, `invite-only`),
  including a new test that creates the project and its client from the picker and one asserting a
  member is still refused when repointing a project that already has a client.

## 2026-09-15
### Added
- **Reports by person, and a member only ever sees their own hours (D3).** Reports could group by
  project, client, task and tag but not by the person who logged the time, and every read of tracked
  hours covered the whole workspace — so a member saw their teammates' hours in Reports, in the Timer
  list, in project and client totals, through the MCP tools and in the Assistant's answers. Scope is
  now one rule, `entryScopeUserId` in `lib/permissions.ts` (null for an owner/admin, the caller's id
  for a member), and **every** read of hours goes through it: `/reports/summary|grouped|weekly|detailed`,
  `GET /api/time_entries` (plus `/current` and `/suggestions`), project, client and task totals,
  `ai/summary`, the email digest, the MCP read tools and the Assistant's. Reports gained a `userIds`
  filter and a `user` group dimension — the "Person" filter and "Group by person", offered only to an
  owner or admin, and a member who forges `userIds` in the query still gets only their own hours,
  because the scope is applied in `buildReportWhere` rather than in the UI. The Timer is personal for
  everyone, admins included (list, calendar, timesheet, day totals); the team lives in Reports.
  `GET /api/me` (new `routes/me.ts`, `hooks/useWorkspaceRole.ts`) tells the UI the caller's role, only
  so screens can hide what the server already refuses: editing, archiving or recoloring projects and
  clients, integrations and budgets/pacing are manager-only (`isManager` + `MANAGER_ONLY_ERROR`),
  while creating a client or a project stays open to members. A **Hide amounts** toggle strips money
  from the summary cards, the breakdown, the detailed table, the CSV and Excel exports and the printed
  PDF, and is carried by saved reports so the monthly client report repeats unchanged.
  Verified: `pnpm build` exit 0, `pnpm lint` 0 errors, new `e2e/report-per-person.spec.ts` 4/4
  (a member's reads including a forged `userIds`; an owner grouping by person while their Timer stays
  personal; screens hiding what a member can't do; Hide amounts keeping money out of the CSV).

### Changed
- **Every entry needs an active project, and every project an active client (D3).** Hours landing on
  "No project" can't be billed or reported by client, which is what the monthly client report needs.
  `CreateTimeEntrySchema.projectId` and `CreateProjectSchema.clientId` are required, updates refuse
  `null`, and the rule is enforced on every write path — REST, MCP, the Assistant, draft confirmation,
  calendar convert and recurring templates — through `findActiveProject` (`lib/projects.ts`) and
  `isActiveClient` (`lib/clients.ts`), so an archived or forged id is refused too. The project picker
  groups projects under their client everywhere it appears, creating a project inline asks for the
  client, Start without a project opens the picker instead of tracking into nothing, and an entry row
  reads "Project · Client" (`ENTRY_SELECT` now joins `clients`). The extension's popup lists projects
  by client and its Start button waits for one.
  Verified: new `e2e/project-required.spec.ts` 4/4 (REST refusing an entry without a project and a
  project without a client; a forged or archived project blocked at draft confirmation; the MCP key of
  a member needing a project to log; a member creating clients and projects but getting 403 on edit
  and archive). Full suite: 81 passed, 13 failed — 8 are the pre-existing hover/menu failures that
  fail the same way on clean `master` (`entry-delete`, 5× `entry-inline-edit`, `integration-push-date`,
  the `tier2-features` gaps toggle) and the other 5 pass when re-run serially (flaky under six
  parallel workers).

## 2026-09-14 (3)
### Fixed
- **Per-person timers, Assistant and calendar (D2).** Starting a timer ran `UPDATE ... WHERE
  workspace_id = ? AND stop IS NULL`, stopping every running timer in the workspace; `/current`,
  `?running=true`, the MCP `stop_timer`/`get_running_timer`, the Assistant's tools and its nudges all
  read "whatever is running"; and `timer:start`/`timer:stop` reached every member's socket, so a
  teammate's timer showed up in your timer bar. Running-timer queries now filter by `user_id`
  everywhere (REST, MCP, Assistant, nudges, day drafting). A running entry is owner-only for stop,
  edit and delete, managers included (`canWriteEntry` in `lib/permissions.ts`), and reopening someone
  else's entry is refused. `broadcast()` carries the entry's owner: `TimerRoom` sends timer events
  only to that person's sockets and gives teammates `entries:changed` with a `null` payload — it used
  to carry the entry's description and duration. The Assistant is one `ChatAgent` per person
  (`<workspaceId>:<userId>`, pinned by the `/agents/*` gate) with per-person memory (migration `0036`)
  and tools that read and write only the user's own time; its `startTimer` insert, which bound seven
  values to eight placeholders and never stored the project, is fixed. Calendar connections, ghost
  events, auto-track and recurring templates belong to whoever created them (migration `0037`;
  existing rows go to the workspace owner), so each attendee tracks their own copy of a meeting.
  Migration `0035` swaps the running-timer index to `(workspace_id, user_id)`.
  Verified: `pnpm build` passes and `pnpm lint` reports 0 errors. New `e2e/timer-per-user.spec.ts`,
  7/7: simultaneous timers; 403 on stopping, editing, deleting or bulk-editing someone else's running
  timer, workspace owner included; MCP `stop_timer` scoped to the key holder; a teammate's timer never
  reaches your timer bar; each attendee tracks their own copy of a meeting; recurring templates are
  invisible to teammates; teammates' socket events carry no entry payload. Timer, realtime,
  Assistant, MCP, drafts, calendar-provider, tenant-isolation and recurring neighbours: 39 of 40
  passed — the failure is the `tier2-features` gaps toggle, which fails identically on a clean
  `master`. Migrations applied to the local D1 only. Per-person calendar reads and the Assistant chat
  need OAuth or Workers AI, so they are on the manual test list instead of e2e.

## 2026-09-14 (2)
### Changed
- **Invite-only access (D1).** Anyone could create an account through Google, email code, magic link
  or password, and every new user got a personal workspace. `databaseHooks.user.create.before`
  (`src/worker/lib/invite-only.ts`) is now the single gate for every sign-up path: an account is
  created only for an email with a pending, unexpired invitation from a workspace owned by an
  `ADMIN_EMAILS` address (a secret in production), or for an `ADMIN_EMAILS` address itself. A Better
  Auth `hooks.before` refuses sign-in codes and magic links for such emails before anything is sent —
  errors thrown inside Better Auth's send callbacks are swallowed, and the magic-link verify step can't
  surface a hook error. Password sign-up is compiled out of production builds (password sign-in
  stays); only an `ADMIN_EMAILS` address may create a workspace (`allowUserToCreateOrganization`),
  closing the "create a workspace, invite anyone" bypass; accepting an invitation requires a verified email outside dev. Only the first `ADMIN_EMAILS`
  account (and `@example.com` e2e accounts in dev builds) gets a workspace. Front: `/signup` and
  `SignupPage` are gone; the login page honors a same-origin `?redirect=` so the invitation link
  returns to `/accept-invite`; a signed-in user with no workspace gets `NoWorkspacePage` (pending
  invitations, or a prompt to sign in once with an email code when the address is unverified, since
  Better Auth lists invitations only for verified emails). `AuthGuard` reads workspaces through a
  user-keyed TanStack query (`hooks/useWorkspaces.ts`) because Better Auth's `useListOrganizations`
  atom never refetches when a different user signs in on the same tab. Team settings hide invite,
  role and remove controls from plain members (the server already refuses them).
  Verified: `pnpm build` passes and `pnpm lint` reports 0 errors on the final code (`pnpm check`,
  including the wrangler dry-run, passed one revision earlier). New `e2e/invite-only.spec.ts`
  (refusal on password, code and magic link with no account left behind; a non-admin workspace owner
  gets 403 opening a workspace; the invitee joins only the inviting workspace, gets 403 opening one
  and cannot invite; an invitation from a workspace with no admin owner creates no account; the
  no-workspace screen holds and the invitation link lands in the app; no sign-up on the login page)
  plus `tenant-isolation`, `admin` and `fresh-session`: 9/9. Full suite: 65 passed, 12 failed — 4 passed on re-run (load
  flakes) and the other 8 (`entry-delete`, five `entry-inline-edit`, `integration-push-date`,
  `tier2-features` gaps toggle) fail identically on a clean `master` worktree (2bcac5f), so they
  predate this change. Before deploying: set the `ADMIN_EMAILS` secret.

## 2026-09-14
### Fixed
- **Dependabot config + all 55 open security alerts resolved.** `.github/dependabot.yml` had
  been created via GitHub's UI with an empty `package-ecosystem`, which failed config validation
  and silently stopped Dependabot from running at all — set to `npm` + `github-actions`. Then
  closed every open alert (2 critical, 22 high, 29 medium, 2 low): bumped direct deps `hono`
  4.12.30 → 4.13.7 and `sharp` ^0.35.3 → ^0.35.4, added `pnpm.overrides` in `package.json` to pin
  patched versions of transitive deps that don't surface in `package.json` directly (`next`,
  `@hono/node-server`, `fast-uri`, `qs`, `browserslist`, `baseline-browser-mapping`, `nanoid`,
  `ip-address`, `undici`, `postcss`, `brace-expansion`) — stayed within each package's current
  major version to avoid breaking changes rather than jumping to latest majors (e.g. `nanoid` 3.x
  not 6.x, `@hono/node-server` 1.x not 2.x). `react-router-dom` bumped ^7.18.1 → ^7.18.3 to pull a
  patched `react-router`. Verified: `pnpm audit` clean (was 55 alerts), `pnpm check` (typecheck +
  build + `wrangler deploy --dry-run`) and `pnpm lint` both pass. Could not run `pnpm test:e2e`
  locally — this machine has multiple Cloudflare accounts on the wrangler CLI with none pinned via
  `CLOUDFLARE_ACCOUNT_ID`/`account_id`, so the dev server's remote proxy session (for the `AI`
  binding) refuses to start non-interactively; pre-existing local environment gap, unrelated to
  this change. `.github/workflows/e2e.yml` will run e2e automatically on this push to `main`.

## 2026-09-11 (3)
### Added
- **Autor visível no Timer e nos Relatórios.** Completa o item 1 da fila (a parte de dado/permissão
  já tinha saído antes hoje): `EntryRow` (lista do Timer) ganhou um avatar com tooltip do nome, e a
  tabela detalhada de Relatórios ganhou a coluna "Person" (togglável, igual às outras). Some quando
  não há autor conhecido (linha antiga, ou entrada materializada por cron). Verificado: `pnpm check`
  e `pnpm lint` limpos, deploy em produção (curl 200).

## 2026-09-11 (2)
### Added
- **`time_entries.user_id` + permissão de edição.** Causa raiz: a tabela não guardava quem lançou
  cada hora — qualquer membro do workspace podia editar/apagar o lançamento de qualquer outro, sem
  checagem nenhuma além do workspace. Motivo: pedido direto para que só owner/admin possam mexer em
  lançamento alheio; membro comum só no próprio. Coluna nova é nullable (linhas antigas e entradas
  materializadas por cron — recorrência, auto-track de calendário — não têm um humano único como
  autor, então ficam livres pra qualquer membro editar, igual já era antes). Regra em
  `src/worker/lib/permissions.ts` (`canEditEntry`), aplicada em `PUT/DELETE /api/time_entries/:id` e
  nos endpoints `/bulk`. Todo caminho de criação agora grava `user_id`: criação manual (REST), MCP
  `log_time`/`start_timer`, e confirmação de draft. Migration `0034_time_entry_owner.sql` aplicada no
  D1 remoto antes do deploy. Verificado: `pnpm check` (typecheck+build+dry-run) e `pnpm lint` limpos,
  deploy em produção (curl 200).
  **Ainda falta:** mostrar o autor na UI (Timer + Relatórios) e filtrar por pessoa — isso é só o
  backend/permissão, a parte visual segue nos itens 1 e 2 da fila do `falta.md`.

## [MCP 1.2.0] - 2026-09-11
### Added
- **MCP: `create_client` e `create_project`.** Antes o conector MCP só lia dados e lançava/parava
  timer em cliente/projeto já existentes — não dava pra criar um novo sem abrir a UI. Motivo: pedido
  direto para dar ao MCP o mesmo poder de escrita da UI. Registrados só para key `read_write`, seguindo
  a mesma convenção dos demais write tools (`start_timer`, `stop_timer`, `log_time`, `draft_day`).
  A lógica de criação (`createClient`/`createProject`, incluindo a atribuição de cor automática do
  projeto) foi extraída de `routes/clients.ts`/`routes/projects.ts` para `src/worker/lib/clients.ts`
  e `src/worker/lib/projects.ts`, reaproveitada pela rota REST e pela ferramenta MCP — mantém a
  garantia do projeto de que "um tool nunca discorda da REST API" porque os dois chamam o mesmo helper.
  Verificado: `pnpm check` (typecheck + build + `wrangler deploy --dry-run`, exit 0) e deploy real em
  produção (`curl` 200 em `tracking.gritoweb.com.br`).
