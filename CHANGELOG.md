# Changelog

## 2026-09-21 (70)
### Deployed
- **The tool-approval signature fix (and everything since the last deploy) is live in production.** `pnpm check` (0) then `pnpm run deploy`: Version ID `46d1f22c-2909-4e65-a64a-7d2e52229a6d`. Smoke check: `GET /` → 200, `GET /api/me` (no session) → 401.

## 2026-09-21 (69)
### Fixed
- **Every real tool approval in the Assistant chat was silently broken — only forged ones were ever actually tested against the S-02 fix.** Asked to log time and clicking the real "Approve" button, nothing was created. Root cause, found by driving the real WebSocket protocol against local dev: `agents@0.17.4` persists a `tool-approval-request` part as `{id, approved}`, dropping the `signature` the `ai` SDK itself issued in the same event — so `validateApprovedToolApprovals` rejected every genuine approval with "missing signature", not just forged ones (S-02's fix closed the security hole but broke the entire legitimate approval path for every `MUTATES`/`DESTRUCTIVE` tool). `ChatAgent` now taps its own outgoing stream (`toUIMessageStream().pipeThrough(...)`, since `streamText`'s `onChunk` doesn't expose this event type) to cache each signature it issues, and a new `restoreApprovalSignatures()` (`assistant-messages.ts`) re-attaches it before the message is converted for the model — only for a `toolCallId` this server actually emitted, so a forged approval still fails closed exactly as before. Verified end-to-end against local dev: a real approve now creates the entry (confirmed in D1); a forged pre-approved `delete_time_entry` (fabricated toolCallId, no matching cache entry) still gets rejected and the target entry survives. `tsc -b` (0), `lint` (0), `vitest run` (978/978, +4 new tests).
- **The Assistant could go silent after a tool succeeded.** Even with the signature fix, the model sometimes ends its final turn with no confirming text once an approved tool's result comes back — mitigated two ways: the chat's generic tool-result card already renders the outcome + a real link regardless of the model's text, and the prompt now explicitly requires a one-sentence confirmation once a write's result is seen, even if the plan was already described before approval.

## 2026-09-21 (68)
### Fixed
- **The Assistant's "logged it" link carried no proof it actually happened.** `entryUrl` only ever encoded the entry's date (`?date=2026-09-21`) — information the model already has from context, so a false "Registrei... Link: .../?date=..." claim (from the write-confirmation bug fixed above) looked completely genuine even though nothing was created. The url now also carries the entry's real id (`&entry=<id>`), which only exists after a write actually returns it; `TimerWorkspace` reads it on load and flashes that entry, so the link is more useful too, not just harder to fake. Ruled out an alternate hypothesis first (no "start timer" tool exists in the catalog — confirmed by grep — so the model wasn't confusing `log_time` with starting a timer). `tsc -b` (0), `lint` (0), `vitest run` (974/974).

## 2026-09-21 (67)
### Added
- **Deleting a time entry now asks first.** Single-row delete, the bulk selection bar's "Delete", and a description group's "Delete all" all open the same `ConfirmDialog` tasks already use, instead of deleting immediately (the undo toast stays as a second safety net on the two single-entry paths). Requested by Luis after noticing entries vanished with no confirmation, unlike tasks.
- **Right-click a task to edit or delete it.** Both the board card and the list row now open a small context menu (reusing the existing `ContextMenu` primitive, unused until now) with "Edit task…" and "Delete" — the same edit sheet and delete confirmation the "…" menu already used, no new dialog or mutation path. `tsc -b` (0), `lint` (0), `vitest run` (974/974, unaffected — these surfaces had no prior test coverage; verified by hand instead).

## 2026-09-21 (66)
### Fixed
- **The Assistant could confirm a write "succeeded" without ever seeing it happen.** `log_time` (like every other mutating tool) needs a human approval click in the app before it runs; asked "foi?" right after logging time, the model answered "Sim, registro finalizado! 2h 43min..." with no approval ever granted and no entry ever created (a follow-up `list_time_entries` came back empty) — confirmed working correctly the same request via the MCP client instead, isolating the bug to the in-app chat's grounding, not `log_time` itself or the S-02 approval-signature fix. The prompt's "ground factual answers" rule covered read queries but not confirming a write; it now forbids claiming a mutation succeeded without a fresh tool result in the same turn, and requires a `list_/get_` check before answering an uncertain "did it work?". `tsc -b` (0), `lint` (0), `vitest run` (974/974, +1).

## 2026-09-21 (65)
### Deployed
- **All 37 `SECURITY.md` findings (S-01 through S-34) are live in production.** `security` fast-forwarded into `master` (`501c47b`); remote D1 migrations `0051_keep_one_owner.sql` and `0052_saved_reports_workspace_fk.sql` applied before the deploy (bookmark `00000af4-00000000-000050ed-c298fa9d8899e5596822f4a28f32a531` taken first). `pnpm check` (0) then `pnpm run deploy`: Version ID `4ce4b931-e7b6-4262-9b44-7e5c1696eaff`. Smoke check: `GET /` → 200, `GET /api/me` (no session) → 401.

## 2026-09-21 (64)
### Fixed
- **Every remaining `SECURITY.md` finding (S-08 through S-34) is now fixed, tested, and re-verified.** Five agents (one file-owner each), a blind re-exploitation pass by an independent pentest agent against a live `pnpm dev`, and manual browser confirmation by Luis on the highest-risk items. Full regression after all fixes: `tsc -b` (0), `lint` (0), `vitest run` (973/973), `pnpm build` (0), `wrangler deploy --dry-run` (0).
- **A task comment could be edited/deleted through another task's URL, and its pagination cursor accepted a comment id from a different task.** `SECURITY.md` S-08/S-20: `PATCH`/`DELETE /api/tasks/:id/comments/:commentId` and the `before` cursor filtered only by `workspace_id`, not `task_id`. Both now bind `AND task_id = ?` too.
- **Two concurrent confirmations of the same drafted day duplicated the time entry.** `SECURITY.md` S-09 (MEDIUM): the `INSERT` into `time_entries` is now gated on `WHERE EXISTS (SELECT 1 FROM draft_entries WHERE id=? AND workspace_id=? AND user_id=?)`, inside the same `db.batch()` that deletes the draft — the losing side of a race inserts nothing and gets `404` instead of a duplicate. Reproduced with 6 parallel confirmations (before: 2 entries; after: 1).
- **Bulk edit/delete of time entries 500'd past ~98 ids, and its `updated`/`deleted` counts were the request size, not real rows changed.** `SECURITY.md` S-10/S-27 (MEDIUM/INFO): D1's 100-bound-parameter limit. `ids` capped at 10,000 (matching the report table's own row cap), chunked into 90-id `db.batch()` statements; a same-call tag replacement that cost ~2,000 statements for 500 ids was rewritten to ~28. Counts now sum real `meta.changes`.
- **A `taskId`/`projectId` from another workspace was accepted (and stored) on time entries, tasks, task statuses, and drafts.** `SECURITY.md` S-19 (LOW): every one of these write paths now validates the id against the caller's `workspace_id` before writing, returning `400`/`404` instead.
- **File uploads to a task materialized the entire body before checking the 10 MB limit, and a task could hold unlimited attachments.** `SECURITY.md` S-11/S-21 (MEDIUM/LOW): `Content-Length` is checked before `parseBody()` (early `413`); attachments are capped at 50 per task, re-checked inside the `INSERT` itself so a parallel upload race can't slip past the pre-check (and cleans up its R2 object if it loses).
- **A GIF attachment passed through unsanitized, so a hostile Comment Extension or trailing bytes survived the round trip.** `SECURITY.md` S-22 (LOW): new `sanitizeGif()` rebuilds a GIF from its structural blocks (frames, graphic control, the `NETSCAPE2.0` loop only), dropping comments, other application extensions, and anything after the trailer, byte-identical otherwise (verified against PIL/ImageMagick).
- **Integration error messages could leak an upstream's entire response body, unattributed.** `SECURITY.md` S-12/S-13 (MEDIUM): Workfront/Dynamics' `readError()` read the full body before truncating (a 30 MB response cost ~110 MB RSS); the new shared `readUpstreamError()` reads at most 2 KB via `getReader()`, strips control characters, and prefixes the message with the upstream's own host so it can never pass as a system message.
- **CSV export let a description starting with `=`, `+`, `-`, `@`, or a tab become a live formula in Excel/Sheets.** `SECURITY.md` S-14 (MEDIUM): `csvCell` now prefixes those text cells with `'`; numeric cells are untouched.
- **The Assistant answered anything, on or off topic, at the company's expense.** `SECURITY.md` S-15 (MEDIUM): a `SCOPE:` line added to the system prompt declines non-product questions in one sentence; confirmed live against the real model.
- **The extension's API allow-list accepted any `*.workers.dev` subdomain, a proxy vector with no current legitimate use.** `SECURITY.md` S-16 (MEDIUM): removed from `normalizeApiUrl` and `manifest.json`'s `host_permissions`.
- **The offline mutation queue replayed one person's edit under whoever was signed in next.** `SECURITY.md` S-17 (MEDIUM): each queued mutation now records its owner (current session, falling back to the last known signed-in user for a momentarily empty session store); `drainQueue` only replays a mutation for its own owner, and `signOut()` clears the queue.
- **`pnpm build` copied real dev secrets into the `dist/` artifact.** `SECURITY.md` S-18 (MEDIUM): a build-only Vite plugin strips `.dev.vars` from the bundle before it's written (`KEEP_DEV_VARS=1` opts back in for `pnpm preview`/Playwright's webServer, which need the file); `pnpm dev` is unaffected.
- **GitHub Actions were pinned by floating tag (`@v4`) with no explicit `permissions:` block.** `SECURITY.md` S-25 (LOW): pinned to full commit SHAs resolved from the GitHub API, plus `permissions: contents: read`.
- **Two owners stepping down or removing each other at the same instant could zero out an organization's owners — an irreversible lockout.** `SECURITY.md` S-29 (previously PLAUSIBLE, not executed — now CONFIRMED and fixed): Better Auth counts owners then writes, a classic TOCTOU. New migration `0051_keep_one_owner.sql` adds SQLite triggers that refuse the losing side at the database level (which serializes writes), while still letting a whole organization or user cascade-delete through; `beforeDeleteOrganization` in `auth.ts` was added because Better Auth's own `deleteOrganization` deletes members one by one rather than by cascade. A pentest follow-up found the trigger's abort surfacing as a bare `500`; `lastOwnerRaceGuard` middleware now turns it into the same clean `400` the sequential path already gives.
- **`docMentions` recursed without a depth cap over TipTap JSON.** `SECURITY.md` S-30 (PLAUSIBLE, not executed — now fixed): rewritten as an explicit stack with a 100-level cap; a 50,000-level document no longer overflows the stack.
- **Saved report configs and report-filter id lists had no size cap.** `SECURITY.md` S-31/S-32 (LOW): `config` capped at 64 KiB; filter id lists (`projectIds`, `clientIds`, etc.) capped at 200 entries.
- **`archive_project` on a nonexistent or foreign project silently returned success.** `SECURITY.md` S-26 (INFO): now checks `result.meta.changes` and returns `404`.
- **Packaging the extension without `VITE_APP_URL` shipped it pointing at `localhost`.** `SECURITY.md` S-33 (new, MEDIUM, found while fixing S-16): `extension/vite.config.ts` now reads the repo root's `.env` (`envDir`) and fails the production build outright if the variable is missing, instead of silently falling back.
- **`saved_reports.workspace_id` had no `ON DELETE CASCADE`.** `SECURITY.md` S-34 (new, LOW, found by the pentest agent during cleanup): migration `0052_saved_reports_workspace_fk.sql` rebuilds the table with the FK; deleting a workspace no longer leaves an orphaned saved-report row.
- Accepted as-is, no code change: **S-23** (`/API/me` case-sensitivity falling through to the SPA shell — no data exposure, and normalizing it risks the Google OAuth callback route) and **S-28** (hostile attachment filenames are stored raw but already neutralized on every output path).
- New/updated migrations `0051_keep_one_owner.sql` and `0052_saved_reports_workspace_fk.sql` are applied and proven on **local** D1 only — they still need `npx wrangler d1 migrations apply time-tracker --remote` before the next deploy. D1 time-travel bookmark taken right before applying them: `00000af4-00000000-000050ed-c298fa9d8899e5596822f4a28f32a531`.

## 2026-09-21 (63)
### Fixed
- **The Assistant's markdown links can no longer disguise an external origin as an in-app path.** `SECURITY.md` S-06 (HIGH): `appPath()` used a raw prefix check (`href.startsWith("/") && !href.startsWith("//")`), which lets `/\evil.example/x` through as "internal" — but the browser's own URL parser normalizes `\` to `/` while resolving a real `<a href>`, landing on `https://evil.example/x`. The Assistant renders LLM-generated markdown, and the app's own docs already flag calendar/comment/memory text fed to it as untrusted, so a link shaped like this could read as a safe in-app navigation and silently leave the app. Rewrote `appPath()` to resolve with `new URL(href, origin)` — the same algorithm the browser itself uses — instead of a string prefix. New test case in `appPath.test.ts` (3 backslash variants); `tsc -b` (0), `lint` (0), `vitest run` (816/816, +1), plus a live re-run of the exact jsdom PoC from the audit (now rejected instead of treated as internal).
- **`TimerRoom`'s WebSocket now caps message size and rate.** `SECURITY.md` S-05 (HIGH): `webSocketMessage` had no size or rate limit at all — a same-workspace member could send 20 MB messages or ~99,000 messages in 2 seconds and degrade the room for every teammate; the real client sends at most one heartbeat per 30s per tab, so a 1 KB / 20-per-60s cap (mirroring `ChatAgent`'s existing pattern) leaves generous headroom while closing the flood. Oversized messages get `1009`, rate-limit violations get `1008`; normal use is unaffected. `tsc -b` (0), `lint` (0), `vitest run` (815/815), plus a live re-run of both attacks against the dev server (now closed instead of accepted) and a normal-use control (socket stays open).
- **The Assistant's tool-approval gate is now enforced by the server, not just the UI.** `SECURITY.md` S-02 (HIGH): `streamText()` never passed `experimental_toolApprovalSecret`, so `needsApproval: true` on every write tool was decoration — a raw WebSocket message forging an already-"approved" tool call (`tool-delete_time_entry`, `rememberPreference`, any of the 64 catalog tools) executed immediately, no model decision and no human click involved. Wiring the secret in `ChatAgent.ts` makes the `ai` SDK sign every real approval request it emits and reject any response without a valid signature — confirmed live (a forged approval now errors and the target entry survives) with no regression to the real flow (`@ai-sdk/react`'s `addToolApprovalResponse` already round-trips the server-issued signature verbatim when a person clicks Approve). `tsc -b` (0), `lint` (0), `vitest run` (815/815, unaffected — ChatAgent has no unit test, this DO is only PoC-tested like its siblings).
- **Reports no longer resolve a task name across workspaces.** `SECURITY.md` S-03 (HIGH, found independently by two agents): `/api/reports/summary|grouped|detailed`'s `LEFT JOIN tasks` matched only `tk.id = te.task_id`, so a time entry whose `task_id` points at a task in a *different* workspace (a separate, known write-side gap) had its name resolved and returned anyway — any member could read another tenant's task name by planting a foreign id in their own entry. Added `AND tk.workspace_id = te.workspace_id` to all three joins, matching the pattern `ENTRY_SELECT` already used. New permanent regression coverage in `reports.test.ts` (plants the cross-workspace `task_id` directly in the test SQLite, independent of the write-side gap). `tsc -b` (0), `lint` (0), `vitest run` (815/815, +3), plus a live re-run of the original exploit against the dev server (task name no longer appears in any of the three reports).
- **`revoke-session(s)`/`revoke-other-sessions` now require a fresh session.** `SECURITY.md` S-07 (MEDIUM): with `session.freshAge: 0`, Better Auth's own freshness gate on these three endpoints was a no-op, so any session — however old, however it was obtained — could kill every other device on the account with no re-authentication. `requireFreshSession` already existed for `update-user`/`unlink-account`/`delete-user`; wired onto the three revoke endpoints too in `src/worker/index.ts`. Confirmed live: a session aged to `2020-01-01` in local D1 now gets `403 SESSION_NOT_FRESH` from `revoke-sessions`, matching `update-user`'s existing behavior; a fresh session still revokes normally. `tsc -b` (0), `vitest run` (812/812).
- **Session resolution no longer trusts the signed cookie cache.** `SECURITY.md` S-04 (HIGH): `getSession()`'s `session_data` cookie cache is a self-contained signed blob that stays valid for its own `maxAge` (5 min) regardless of server state, so a `sign-out` or `revoke-sessions` call left a stale copy of the cookie authenticating for up to 5 minutes after the session row was deleted from D1 — confirmed live in production by Luis on his own account (`revoke-sessions` returned `{"status":true}` but the old cookie still answered `200`). `resolveWorkspace` (every `/api/*` and `/agents/*` request) and `requireFreshSession` (account deletion) now pass `disableCookieCache: true`, forcing a real D1 check on the same request that already pays for the membership lookup. Confirmed with `pnpm exec tsc -b` (0), `pnpm exec vitest run` (812/812), and a live re-run of both the sign-out and the revoke-sessions PoC against the dev server (both now `401` immediately, were `200`).
- **`bearer()` no longer auto-signs a raw session token.** The security audit (`SECURITY.md` S-01, CRITICAL) found `GET /api/auth/list-sessions` returning each session's raw, unsigned `token` — and better-auth's `bearer()` plugin re-signing any unsigned token on the fly (`requireSignature` was never set), so that raw value alone authenticated as a full session, without ever having been issued to whoever held it. The extension's real bearer flow already sends the *signed* cookie value (`setSignedCookie`, contains a `.`), so `bearer({ requireSignature: true })` in `src/worker/auth.ts` closes the hole with no regression: confirmed with `pnpm exec vitest run` (812/812) and a live re-run of the original hijack PoC against the dev server (now `401` where it used to be `200`), plus a control proving the extension's signed-token flow still authenticates. `list-sessions` still returns the raw `token` in its response (hardening left for a follow-up), but it is no longer sufficient on its own.

## 2026-09-21 (62)
### Changed
- **1.0.0 is in production.** `refactor` was fast-forwarded into `master` (`e058e10`, 39 commits) and deployed to the support Cloudflare account (the only one of the four this login sees that holds the `time-tracker` database).
  - Before writing anything: production read-only showed 3 members and 3 distinct member pairs, 0 time entries without a project (15 entries, 3 projects) and exactly `0049` and `0050` pending; a backup of the remote database was exported outside the repository.
  - Migrations `0049` (two triggers on `time_entries`) and `0050` (unique `member` index) were applied to the remote database and checked (`sqlite_master` lists both triggers and the index).
  - `pnpm check` (typecheck, build, wrangler dry run) passed and `pnpm run deploy` published version `39554ba5`; the git-connected build then published the same commit as `76e4319f`, which is what is live. Pushing to `master` therefore deploys by itself; the migrations do not, and stay a manual step.

Smoke test on the live site: `/` and `/login` answer 200; `POST /mcp` answers 401 with `WWW-Authenticate` and, with a foreign `Origin`, 403; the API sends no `access-control-allow-origin` without an `Origin` and echoes the app's own; HSTS, CSP, `nosniff` and `X-Frame-Options` are present; 46 events tailed from the live version were all `ok` with no exceptions.

Found by testing the limiter in production, which was the one thing that could not be checked before: the shared limits are approximate. 13 quick sign-in attempts were all let through, and 120 in a row (limit 10 a minute) were refused from the 30th on (39 of them); a 700-request burst at `/mcp` (limit 600) was not refused. They stop sustained guessing, not a short burst, as Cloudflare documents ("permissive, eventually consistent"). Nothing was changed in response; the number to tighten, if wanted, is in `SHARED_LIMITS`.

## 2026-09-18 (61)
### Fixed
- **The comments e2e spec looks for the edit field by its real role.** `e2e/task-comments.spec.ts` asked for `getByRole("textbox", { name: "Edit comment" })`, but the field became a `combobox` (the `@` list) in the mention-chip commit `eec4b44`, which is already on `master`; Playwright is not in CI, so the spec had been failing unnoticed. It looks for the `combobox` now.

Verified by running the whole Playwright suite against the local dev server for the first time this round: 134 specs, 130 passed and 4 failed. The comments spec was the stale selector above. The other three (an invitation being accepted, the sign-in page load and "stopping in one tab refreshes Reports in the other") failed on 30-second timeouts and a 5-second visibility wait while two workers loaded one dev server; run alone, with one worker, all 13 specs of those three files and the comments file pass (`report-per-person`, `task-comments`, `timer-cross-tab-sync`).

## 2026-09-18 (60)
### Changed
- **E-mails, the extension popup and the success/warning labels now follow the same colour tokens.**
  - **E-mail theme:** `canvas`, `mutedInk` and `border` were the older, lighter ramp and are now the current tokens (`#ece9e9`, `#6e6867`, `#dfdddc`), so all seven e-mail colours equal the light tokens in `css/global/variables.css`; a test holds every one of them. E-mails come out a little darker in the outer background and the divider, as the app itself does.
  - **Extension popup:** it kept its own inline copy of the tokens in OKLCH, and that copy had already drifted (the pre-ramp `muted` 0.965, `muted-foreground` 0.552, `border` 0.912). It now imports the app's `variables.css` from a `popup.css`, maps the few names its inline styles use (`--bg`, `--fg`, `--brand`, …) onto those tokens, and follows the browser's colour scheme through a `.dark` class (`popup/theme.ts`), which is what the shared tokens switch on. Its two hard-coded `#fff` labels use `--primary-foreground`, and `extension/popup/**` is no longer exempt from the no-raw-hex lint rule (its own comment said that was the plan). One visible difference: in dark mode the primary button's label is the app's dark ink on the bright red (as in the web app) instead of white.
  - **Success and warning labels (light theme):** `--success-foreground` and `--warning-foreground` were `#fafafa`, which is 3.50:1 and 3.07:1 on those fills. They are the ink `#1d1a19` now (4.73:1 and 5.41:1), as the dark theme already does. No component uses these two tokens today, so nothing on screen changes; it is correct for the next one that does.

Verified: the popup was built (`pnpm build:ext`) and opened in a real browser with a stub of the `chrome` API, in light and dark: its computed colours are exactly the app's tokens (`#fcfbfa`/`#111315` ground, `#6e6867`/`#a1a5ac` muted text, `#dd322e`/`#f34a42` brand, `.dark` toggled by the scheme) and the sign-in form renders in both. Tests: the seven e-mail colours, the ink on the success and warning fills, and that the popup imports the shared file, has no `<style>`, no OKLCH and no raw hex. `tsc -b` 0, lint 0.

## 2026-09-18 (59)
### Changed
- **The colour tokens are hexadecimal, and the CSS comments are one line.** `variables.css` held 57 colours in OKLCH, a format that was never chosen for its own sake: it came in with the first commit (the Tailwind v4 / shadcn v4 template generates it) and stayed because the contrast tuning was done on OKLCH lightness. Hex is what design tools export, and the project already kept hand-converted hex copies (`brand-mark.ts`, the e-mail theme), so the same red existed in five places. All 57 are converted (`DESIGN.md`'s copy too). Its comments were 61% of the file (114 of 186 lines, 17 blocks up to 13 lines) against the one-line rule; all 53 multi-line comments in `src/react-app/css/` are now one line, and the original text of each is kept verbatim in the new `docs/CSS_NOTES.md`, headed by the line it sat above.
- **Proof for the colours, not a promise.** The converter reproduces the five hex values the project had converted by hand (`#dd322e`, `#f34a42`, `#fcfbfa`, `#111315`, `#a1a5ac`). Rounding to 8 bits moves a channel by at most 0.5/255. 84 foreground/background pairs (every text token on its grounds, the ink tokens, the focus ring, and the ink tokens on their own 10% tints) were re-measured and **none crosses its WCAG threshold**; the biggest change in a ratio is 0.08. Twelve pages (timer, tasks, reports, projects, settings, sign-in, light and dark) were captured before and after in a real browser and compared pixel by pixel: at most 1 of 255 in light, 4 in dark (under 0.01% of pixels above 2), and the timer page differs only where its loading animation was caught at another angle.
- **Ten tokens are outside the sRGB gamut** (the greens, the amber, the destructive red and the dark brand ink). They are converted by clipping channels, because that is what Chromium renders today: the first attempt used CSS Color 4 chroma reduction, the screenshots showed `#ff796b` where it had produced `#ff8275`, and it was corrected. On a wide-gamut screen those ten will look slightly less vivid than before; Safari and Firefox may have been mapping them differently already.
- Trimming the comments changes nothing in the output: the built stylesheet is byte-identical before and after. One trap on the way: Tailwind scans `.md` files, and the notes (full of class names in backticks) made it emit dead utilities such as `.no-scrollbar` and `.rounded-[1.25rem]`, so `app.css` now says `@source not "../../../docs"`; the output with docs excluded equals the reference build.
- **`DESIGN.md`:** the colour list at its top had two stale values (`muted-light` `#f5f3f2` and `border-light` `#e4e1e0`, from before the ramp moved down; the CSS has `#ece9e9` and `#dfdddc`), now corrected, and the brand-mark table lost its duplicate "oklch" column.
- **Four tests keep the copies from drifting again** (`src/react-app/css/tokens.test.ts`): every colour token is hexadecimal, the five `brand-mark.ts` constants equal the CSS, the four e-mail colours that are current equal the CSS, and the fifteen colours at the top of `DESIGN.md` equal the CSS. Broken on purpose (a hex off by one, an OKLCH value) they fail 3 and 4 tests. `node:fs` gets a small type declaration (`src/test/node-fs.d.ts`) because vitest returns an empty string for a `.css` imported with `?raw`.

Found and left alone: the e-mail theme's `canvas`, `mutedInk` and `border` are the older, lighter ramp (changing them would change how every e-mail looks); the extension popup keeps its own OKLCH copy of the tokens (the extension is out of scope); and white text on the success fill (3.50:1) and on the warning fill (3.07:1) is under 4.5 for small text, as it was before this change (large text and icons clear 3:1).

Verified: `tsc -b` 0, lint 0, vitest green, `pnpm check` 0.

## 2026-09-18 (58)
### Changed
- **One home for the shared limits and one "too many requests" answer.** The numbers of the three shared limiters lived twice each: in `wrangler.jsonc` and as literals in `index.ts` (10 for sign-in, 20 for AI) or in `mcp/gate.ts` (600), and only the `/mcp` one had a test tying them together. They now live in `SHARED_LIMITS` (`middleware/rate-limit.ts`); `sharedRateLimit(name)` builds a route's limiter from it and the `/mcp` gate reads it too, so the code says each number once. A single test holds `wrangler.jsonc` to the table (every name, its limit and its 60-second period, and that no limiter is declared that the code does not know), which is the part that cannot be shared because Cloudflare reads that file, not the Worker. The 429 is one function, `tooManyRequests`, used by the Hono middleware and by `/mcp` (which runs outside Hono); before, they built two slightly different bodies (`{message}` and `{error}`). Behaviour is unchanged: sign-in stays at 10, AI at 20, `/mcp` at 600.

Verified: 22 tests on the limiter and the gate (the per-limiter numbers against `wrangler.jsonc`, `sharedRateLimit` refusing after exactly AI's 20, the shape of the 429), `tsc -b` 0, lint 0, vitest green.

## 2026-09-18 (57)
### Changed
- **The `/mcp` limit goes from 120 to 600 requests a minute per address.** The ordinary `/api` routes (time entries, tasks, reports) have no blanket limit at all; only the sensitive endpoints do (sign-in, AI, e-mail, outbound). `/mcp` had a blanket one, and 120 a minute is easy to reach for legitimate use: an agent fires several tools a second, and a whole office leaves through one address. 600 (ten a second) is only reached by a script or an attack, and the limit exists to keep key guessing and floods off the database, not to pace real use. `MCP_REQUESTS_PER_MINUTE` in `mcp/gate.ts` and `MCP_LIMITER` in `wrangler.jsonc` are the same number, and a test fails if they drift apart. This supersedes the 120 written in entry (43) and in the docs, which now say 600.

Verified: the gate lets exactly 600 requests from one address through and refuses the 601st (test), the test that reads `wrangler.jsonc` finds `MCP_LIMITER` at 600, and the wrangler dry run lists `env.MCP_LIMITER (600 requests/60s)`. `pnpm check` 0.

## 2026-09-18 (56)
### Changed
- **Documentation brought up to date with what shipped in this round.** `USER_GUIDE`: a "Comments, mentions and images" section (the `@` list beside the caret, e-mail on repeated names, editing, who can delete, paging, the count on the card, the panel following a teammate's edits, Attach image) and the **seven** default statuses (it still described five). `ARCHITECTURE`: shared request limits and the fifth security pass (with what cannot be closed in a Worker), the `/mcp` gate, the comment permission and paging rules, the two database integrity rules (`0049`, `0050`), workspace-owned keys/tags/favorites, the split stylesheet and named patterns, and a rewritten Testing & CI section (it claimed there was no unit test framework and that Playwright was a required check). `MCP`: `list_task_comments` paging, the `403 Forbidden origin` and `429` troubleshooting entries and the two new security-model points. `CLAUDE.md` and `README`: the test setup and the seven statuses. `ROADMAP`: the cross-isolate limit is no longer open, and a section records what was left out on purpose (MCP breadth, the extension, the hardening with no cheap fix).
- **`package.json` gets `"version": "1.0.0"`** and `docs/RELEASE_1.0.0.md` holds the release notes, the known limits and the deploy order. The tag is not created; nothing is deployed or merged into `master`.
- The `delete_task_comment` tool description no longer says only the author can delete (owners and admins can), so a model is not told the wrong thing.

Verified: `pnpm install --frozen-lockfile` still passes with the version added; `tsc -b` 0, lint 0, vitest green.

## 2026-09-18 (55)
### Changed
- **Two people with the same name can be told apart in the @ list.** The list showed an avatar and a name, so two members called "Sam" looked identical when picking one. Rows whose name repeats within the list now also show the e-mail underneath (and only those rows, so the usual list stays as compact as before). In a comment the pick is remembered by id, so choosing the right row is enough to tag the right person.
- **Known limit, now written down in `TaskTitle`:** a task title is plain text by design (a tag marker would end up on board cards and invoice lines), so a repeated name in a title resolves to the first person with that name; tag them in a comment for an exact tag. Nothing else changes for titles.

Tests (`MentionOptions` had none): only the name when names are all different; the e-mail on the rows of a repeated name and not on the others; picking the second of two same-name people passes that person's id. `tsc -b` 0, lint 0.

## 2026-09-18 (54)
### Changed
- **The @ list in the comment field opens beside the "@" being typed, not under the whole field.** In a comment of several lines the list appeared below the entire box, far from the caret. `MentionInput` now anchors it to the position of the "@" (`caretRect`, which lays the text before it out in a hidden copy of the field with the same font, width and wrapping) and asks for that position again whenever the popover repositions, so it follows a scroll. It is the same behaviour as the description editor, and the helper that anchors a popover to a rectangle (`anchorAt`) is now shared by both instead of living inside one.

Verified in a real browser with a six-line comment, typing `@De` at the start of line two: the field spans y 220 to 341 and the list opens at y 270, right under line two (it used to open at the field's bottom edge). Tests for `caretRect` (leaves nothing in the DOM, is a zero-width line-high box starting from the field, works at the end of the text and on an empty field) and `anchorAt`; the existing `MentionInput` tests still pass. `tsc -b` 0, lint 0.

## 2026-09-18 (53)
### Changed
- **Editing a comment looks like writing one.** The in-place edit form was the default field (its own rounded box, a fixed two-line height and a resize handle) while the composer below the thread is a frame around a bare field with the button inside. The edit form now uses the same: a `rounded-md border` frame holding a `bare` field that grows with its text, no handle, and Cancel/Save inside the frame.

Verified in a real browser, light and dark, by opening the edit form on a comment: the field has no border, fill or radius of its own (also in dark, where the old field had the lighter fill), sits at the composer's 72px minimum height, and Cancel/Save are inside the frame. `tsc -b` 0, lint 0, vitest green.

## 2026-09-18 (52)
### Fixed
- **A @mention chip in a task description shows the person's current name.** The chip stores `{ id, label }` when it is inserted, and the editor drew the saved label, so someone renamed later kept showing under the old name in every description that tagged them (the comment chips already looked the name up by id). `refreshMentionLabels` now runs when the editor's team or content changes, matches each chip to a member by id and rewrites its label to the current name, so it also shows on screen. It runs after the content sync (which would otherwise bring the old label back), keeps the saved label of someone who is no longer a member, and is not put on the undo stack, so undo cannot resurrect the old name.

Verified in a real browser: a task whose description was saved with the label "Old Demo Name" for the demo user opened with the chip reading "@Demo User". Tests on a real TipTap editor (jsdom): a renamed person is updated in the document and on screen, nothing changes when the label is already current, a person who left keeps the saved label, two people with the same name keep their own by id, a document without mentions is untouched, and undo does not bring the old name back. `tsc -b` 0, lint 0.

## 2026-09-18 (51)
### Changed
- **`Input` has a `bare` variant, so the "transparent field" trick lives in one place.** The base `Input` fills itself in the dark theme (`dark:bg-input/30`), and a `dark:` class beats `bg-transparent`, so every borderless field had to remember to add `dark:bg-transparent` too; two of them forgot once and showed a lighter box in dark mode (fixed in an earlier entry, but nothing kept it from happening again). `variant="bare"` (no fill, border or shadow, dark included) now does it, matching the `Textarea` variant of the same name; the timer bar's description field and the "Add a subtask" field use it and keep their own padding and focus ring.

A scan of every `Input` that forces a transparent fill found three: the two above, and the task panel's Estimate field, which stays as it was because it needs a transparent border that is still there (so it does not change size on hover).

Verified in a real browser by measuring 14 computed properties (background, border, radius, padding, size, shadow, outline, font and colour) of the three fields in light and dark, at rest, hovered and focused, before and after: 18 snapshots, 0 differences. Tests for the variant (dark fill gone, default look untouched, a screen's own padding and ring survive). `tsc -b` 0.

## 2026-09-18 (50)
### Fixed
- **A person can be a member of a workspace only once (migration `0050`), which ends the duplicate demo membership.** `member` had no uniqueness rule, and the seed's `INSERT OR IGNORE` only ignores a repeated `id`, so a demo user who already had a membership under another id got a second row for the same workspace. The Assistant and the workspace list then rendered the workspace twice, which React reported as `Encountered two children with the same key` in the console (three of them on every page load). `idx_member_org_user` is a unique index on `(organizationId, userId)`: the same `INSERT OR IGNORE` now does what the seed meant, and a real duplicate would be refused instead of stored. The read-only check of the production database on 21/09 found 3 members and 3 distinct pairs, so nothing needs cleaning there. Not applied to the remote database.
- **The dev seed no longer breaks on the "horas só com projeto" rule.** Writing the test for the item above ran the real `seeds/dev-seed.sql` on a fresh database and it aborted with "A time entry needs a project": three of its entries (`entry014`, `entry026`, `entry037`) had no project, which was allowed until migration `0049` made the database refuse it. They now belong to a project with a client, so `wrangler d1 execute --local --file=seeds/dev-seed.sql` works on a new database again.

Verified: the migration applied to the local D1 (after removing the one duplicate row that test data had left); a page load of the timer, tasks and reports pages shows 0 duplicate-key errors (it was 3). Tests on a real SQLite: a second membership for the same pair is refused, one person can join two workspaces and two people can share one, `INSERT OR IGNORE` with a different id is a no-op, and the real seed file run twice leaves one membership and no error. `tsc -b` 0.

## 2026-09-18 (49)
### Added
- **Tests for the API key lookup and the API key, tag and favorite routes, on a real database.** `lib/api-keys` is the whole authentication path of `/mcp` and had no test.
  - **`resolveApiKey` (15):** the plaintext is returned once and only its SHA-256 is stored; two keys are never the same; a key resolves to its workspace, the person who minted it and its scope; no header, an empty one, another scheme, a bearer with no token, a session-style token and a never-issued key are all refused; the scheme is case-insensitive; **a key stops working when its owner leaves the workspace (and only that person's keys do)**; a revoked key stops working; listing carries no secret; another workspace's key cannot be revoked.
  - **Routes:** a key is shown in the one response that creates it and never again, an unknown scope is refused, each workspace sees only its own keys and a foreign key answers 404 and survives; tags and favorites are listed by workspace, created with the right owner (a tag gets a colour, a repeated name returns the existing tag, two workspaces may share a name), and recolouring or deleting another workspace's tag or favorite changes nothing. A favorite that points at another workspace's project does not disclose that project's name.
- **The coverage floor rises again, to 44% lines / 41% branches** (measured 44.2% / 41.8%).

Verified by breaking the code and restoring it: dropping the member join from the key lookup and the workspace filter from revoke fails 3 tests (the leaving owner's key still working, and both cross-workspace revokes). `tsc -b` 0, lint 0, vitest 778/778.

## 2026-09-18 (48)
### Changed
- **Four patterns that were pasted into several screens are now one thing each.** A scan of every screen found only six long class strings repeated three or more times, so the code was already tidy; these are the ones worth naming:
  - `Button` variant **`ghost-destructive`**: the quiet control that only turns red under the pointer (sign out, remove a passkey, revoke a session, delete a recurring entry or a subtask, unlink an account, remove a user). Seven screens wrote `variant="ghost"` plus `text-muted-foreground hover:text-destructive`; the `shrink-0` several of them added was already in the button's base classes.
  - `CenteredPage` (`components/layout`): the full-height tinted ground of the sign-in, invitation and no-workspace pages.
  - `ReportFigure` (`components/reports`): the small right-aligned share (`percent`) and amount (`amount`) numbers beside a report row's duration, eight copies across `BreakdownCard` and `SummaryTree`.
  - `SettingsHint` (`components/settings`): the supporting line under a settings label or list item.
  Nothing else was touched: the invitation page keeps its second, untinted `<main>` (a different look), and the near-misses found by the scan (a link-like button with `h-auto p-0`, the solid red ones) stay as they are.

Verified: the built stylesheet is the same 156 rules and 109,318 bytes as before, the calendar stylesheet is byte-identical, so nothing can render differently. In a real browser the sign-in page's `<main>` keeps its classes and computed height, background and alignment, the Settings button goes from the muted grey to the destructive red on hover, and the hint lines render. Tests for the variant, `ReportFigure` and `CenteredPage`. `tsc -b` 0, lint 0, vitest 750/750, build ok.

## 2026-09-18 (47)
### Changed
- **The coverage floor goes from 28% lines / 31% branches to 42% / 40%, and routes now count.** The measured coverage of the files already listed was 45% / 46%, so the floor was far below reality. `src/worker/routes/**` and `src/worker/db/**` are now in the measured set, which is why the honest number is 42.3% lines and 40.9% branches (many route files still have no test); the floor sits just under that so it can only go up.

Verified: `vitest run --coverage` exits 0 at 42.34% lines and 40.91% branches with the new floor.

## 2026-09-18 (46)
### Added
- **Tests for the report routes and the task status routes, on a real database.** `routes/reports` and `routes/task-statuses` had none.
  - **Reports (17):** the summary adds up the whole workspace for an owner or admin and only a member's own hours for a member, even when the member asks for a teammate through `userIds`; running timers, other dates and other workspaces are never counted; the totals break down by project and by day; filters (project, billable, description) and their escaping (`%` and `_` are plain characters); rounding applies per entry before summing (up and down, checked by hand); grouping by person or nesting a sub-group keeps totals consistent and a member only sees themselves; the weekly buckets and the detailed list (amounts, newest first, rounded amounts) follow the same scope.
  - **Task statuses (24):** listing is open to any member; creating, renaming, archiving and forking are owner/admin only; names are unique ignoring case and spaces (but may repeat across workspaces); exactly one default, and a completed status cannot be it; the workspace always keeps one completed and one open status; recategorising carries the tasks across the done line both ways; archiving a status that holds tasks needs `moveTo`, moves them (and marks them completed when the target is), refuses moving into itself or into another workspace's status, and hands the default flag to the next open status.

Verified by breaking the code on purpose and restoring it: dropping the member filter from the report query fails 5 tests, and removing the workspace filter from the status lookup fails the 3 cross-workspace tests. `tsc -b` 0, lint 0.

## 2026-09-18 (45)
### Added
- **Tests for the time entry routes, run against a real database.** `routes/time-entries` had none. 38 tests now drive the router as an owner, an admin and two members in one workspace (and an owner of a second one) over an in-memory SQLite with every migration applied, so they check the real SQL and the real permission rules: a member lists only their own hours while an owner or admin lists the workspace's (never another workspace's); `?running=true` and `/current` return only the caller's timer; `GET /:id` hides a teammate's entry from a member; `POST` needs an active project with a client (archived, client-less, another workspace's and unknown projects are all refused and store nothing) and stops only the caller's running timer; `PUT`, `DELETE`, the bulk edit and the bulk delete follow author-or-manager, keep a running timer to the person tracking (an admin gets 403), refuse a stop before the start even from a one-field edit, refuse an archived project, refuse the whole bulk when one entry is not allowed (and change none), and never reach another workspace when handed its ids; `PATCH /:id/stop` stops only your own, answers `null` for a vanished id and leaves a finished entry alone.
- `src/test/route-harness.ts` mounts a router as one person in one workspace over that database (reusable for the next route), and `sqlite-d1.ts` learned `batch`.

Fixed in passing: a comment on `GET /` said the Timer list is personal for owners too, which is the opposite of the code and of CLAUDE.md ("every read of tracked hours goes through `entryScopeUserId`"; owner/admin see the workspace). Removed.

Verified: breaking `entryScopeUserId` (everyone sees the workspace) fails the member-list test, and letting a manager touch a running timer fails three tests (edit, delete and bulk delete); both restored, 38/38. `tsc -b` 0, lint 0.

## 2026-09-18 (44)
### Security
- **The calendar OAuth state cookie is `__Host-` prefixed over https.** `tt_cal_state` carries the random state, the provider, the workspace and the person who started the connection, and the callback trusts it. It was already `httpOnly`, `SameSite=Lax`, short-lived and bound to the session that comes back, so it was not forgeable from the page. What it could not stop is a cookie set from another subdomain of the same parent domain (which hosts other sites): browsers let a sibling subdomain plant a plain cookie for the whole domain. With the `__Host-` prefix (Secure, `Path=/`, no `Domain`) they refuse that outright, which is why this is preferred over signing the value: the fix is enforced by the browser, not by our code. Over http (local dev) the name stays plain, because a Secure cookie cannot be set there.

Not a vulnerability that was exploitable as found: it needed a foothold on a sibling subdomain and the victim's ids, and its worst outcome was linking the attacker's own calendar into the victim's timesheet. Treated as hardening.

Tests (the calendar route had none): the cookie is `__Host-`, Secure, `Path=/`, HttpOnly, `SameSite=Lax` and has no `Domain` over https, and keeps the plain name over http; the callback accepts the matching cookie and clears it; a plain-named cookie sent over https is ignored; and it refuses a wrong state, another person's, another workspace's, the other provider's, and no cookie. `tsc -b` 0.

## 2026-09-18 (43)
### Security
- **Request limits are shared across isolates, and `/mcp` finally has one.** The limiter was a `Map` inside each Worker isolate, so an attacker whose requests landed on different isolates (or locations) got a fresh allowance each time, and the 10-a-minute login limit was closer to a suggestion. It now also asks a Workers Rate Limiting binding (one counter per location, shared by every isolate there) for the sign-in and auth endpoints (`AUTH_LIMITER`, 10/min), the AI endpoints (`AI_LIMITER`, 20/min) and `/mcp` (`MCP_LIMITER`, 120/min per address). The local count still runs first, so a hot source is stopped without a network call; if the binding itself fails the request goes on with the local count and a warning in the log, so an outage there cannot lock everyone out. The bindings are declared under `ratelimits` in `wrangler.jsonc` (with unusual `namespace_id`s, which must be unique in the whole account) and typed by `pnpm cf-typegen`. They are switched off in the dev server, where the local limits stay relaxed for the e2e suite.
- **`/mcp` checks before it touches the database.** It is served outside Hono, so it had no CORS, no limit, and looked the API key up in D1 on every request, however many. `mcpGate` now runs first: a browser `Origin` that is not ours gets 403 (the Streamable HTTP spec's defence against DNS rebinding; MCP clients are programs and send no `Origin`), then the per-address limit answers 429 with `Retry-After` before `resolveApiKey` runs.

Documented behaviour of the binding: "permissive, eventually consistent", per location, `period` must be 10 or 60 seconds. It slows abuse; it is not exact accounting.

Verified in the built worker running in production mode locally (`wrangler dev`, where the three bindings load as local): 135 keyless POSTs to `/mcp` from one address gave exactly 120 × 401 and then 15 × 429 with `Retry-After: 59` and `Cache-Control: no-store`; a foreign `Origin` got 403; 12 sign-in attempts gave 429 from the 11th. Control: bursts of POSTs *with a body* make the local runtime restart ("Your worker restarted mid-request", 503) after about 80–120 requests, but the previous commit, built separately without any of this, does the same (80 × 503 in 200), so it is the local runtime and not this change; the bodyless burst is the clean proof. Unit tests: local limit, per-address counting, window reset, shared counter refusing, shared counter allowing, local refusal skipping the shared call, no binding, broken binding; the gate for no Origin, own Origin, foreign Origin (403, shared counter not spent), local limit and shared limit. `pnpm check` (typecheck, build, wrangler dry-run listing the three limits) 0, lint 0, vitest 656/656.

Deploy note: the three `namespace_id`s (540101, 540102, 540103) must be free in the Cloudflare account; the runtime enforcement of the real binding can only be seen after a deploy.

## 2026-09-18 (42)
### Security
- **Attachment downloads say how they are served (`Content-Disposition`).** The download route sent only `Content-Type` (a PNG, JPEG, WebP or GIF, decided from the file's bytes at upload), leaving disposition to the browser. It now sends `inline; filename="…"; filename*=UTF-8''…`, so the image still shows in the page but a "save as" gets the original name. The name is stored user input, so it is cleaned before it reaches a header: control characters, quotes and slashes are dropped (a line break would have made the response throw), non-ASCII goes in the RFC 5987 form with an ASCII fallback beside it, and it is capped at 120 characters. This is hardening, not a hole: the response already carries `nosniff` and a CSP, and only image types are ever served.

Tests: the route serves the stored image inline with its name and 404s another workspace's attachment; the header for a non-ASCII name, for `a"\r\nX-Evil: 1/../b\\c.png` (no CR, LF, quote or slash survives), for a name with nothing usable left, and for a very long one. `tsc -b` 0, lint 0.

## 2026-09-18 (41)
### Security
- **The API no longer answers `Access-Control-Allow-Origin: *`.** When a request carried no `Origin`, the CORS middleware replied with a wildcard. A browser's cross-origin call always carries an `Origin`, so nothing was reachable through it, but a wildcard on an authenticated API is one refactor away from mattering. No `Origin` now means no CORS header; the app's own origin is still echoed and any other gets nothing. The origin check is exported (`isAllowedOrigin`) so `/mcp` can use the same list.

Verified against the dev server before and after: with no `Origin` the response had `access-control-allow-origin: *`, and now has no CORS header; the allowed origin is still echoed and a foreign one gets none. The middleware had no test at all: 5 now (own origin echoed, foreign origin refused, prefix and suffix look-alikes refused, no wildcard, the shared check). `tsc -b` 0.

## 2026-09-18 (40)
### Security
- **The integration URL guard no longer lets an IPv4 address hide inside an IPv6 literal.** `safeIntegrationOrigin` blocked `[::1]`, unique-local and link-local IPv6 but let `[::ffff:a9fe:a9fe]` through, which is `169.254.169.254` (the cloud metadata address), and likewise `[::ffff:7f00:1]` (loopback), the mapped private ranges, `[::7f00:1]`, NAT64 `[64:ff9b::7f00:1]`, 6to4 and Teredo. IPv6 is now an allow-list: only global unicast (`2000::/3`) minus the protocol-assignment, documentation and 6to4 ranges is accepted, so anything that embeds or reserves an address is refused. Its test used `2001:db8::1` as the example of a "public" address, but that is the documentation range; it now uses a real one.
- **Pushes to Workfront and Dynamics no longer follow redirects.** Their `fetch` calls used the default (follow), so a base URL that passed the guard could answer `302` and send the request, with the credentials, to an address the guard never saw. `fetchWithoutRedirect` refuses any 3xx and says where it pointed, so a host that really moved gets a clear message ("use that address as the base URL") instead of a silent hop.

Not fixed, by nature: a public hostname that resolves to a private address (`127.0.0.1.nip.io`) still passes, because the guard looks at the name and a Worker has no DNS lookup to check it against. Only an owner or admin can set an integration URL.

Proof of the gap before the change (the real guard run on the URLs): `[::ffff:127.0.0.1]`, `[::ffff:7f00:1]`, `[::ffff:169.254.169.254]`, `[::ffff:10.0.0.1]`, `[::ffff:192.168.1.1]`, `[::127.0.0.1]`, `[64:ff9b::7f00:1]` and `[::ffff:0:0]` were all accepted; after, all are refused, while `[2606:4700:4700::1111]`, `[2a00:1450:4001:81b::200e]` and `[2001:4860:4860::8888]` are still accepted. 48 integration tests. `tsc -b` 0.

## 2026-09-18 (39)
### Added
- **The lint rule against swallowed errors also catches `.catch(() => undefined)`, `null` and `[]`.** The existing rule only saw an empty arrow body, so these three passed while doing the same thing. `res.json().catch(() => null)` (the "body may not be JSON" fallback, where the `null` is handled right after) is deliberately not flagged.
- **A test that runs the repo's own ESLint config on snippets** (`src/worker/lint-catch-rules.test.ts`), so the rules cannot quietly stop firing: an empty handler, `undefined`/`null`/`[]` handlers, an empty `catch {}` and an `onError` that drops its argument are flagged; a handler that logs, a `catch` block with a comment saying why, and the JSON fallback are allowed.

Triage that led here (all of `src`, tests excluded): 16 places swallow an error and only one is a bare empty handler (`lib/errorReporter.ts`, already justified in place: reporting a reporting failure would recurse). The other 15 are `catch` blocks that carry a comment with the reason (a dead WebSocket, a JSON fallback, an error already toasted), which ESLint's `no-empty` accepts and which stay as they are.

Verified: with the new selector removed, exactly the three new cases fail; restored, 9/9 pass. `pnpm lint` finds no other place in the repo (the extension is untouched). `tsc -b` 0.

## 2026-09-18 (38)
### Changed
- **The stylesheet is split by subject instead of one 600-line `index.css`.** `src/react-app/css/app.css` now only lists the imports, in order; the rest lives in `css/global/` (`theme`, `variables`, `base`, `utilities`, `motion`, `print`, `accessibility`) and `css/components/` (`swatch`, `interaction`, `richtext`, `fullcalendar`). Nothing was rewritten: each file is an exact block of the old one, and the old `styles/fullcalendar.css` moved to `css/components/fullcalendar.css` (still imported by `CalendarBody`, so it stays its own lazy chunk). Only the file layout follows the idea of one folder per concern; no colour, size or rule was taken from another project. `main.tsx`, `components.json`, the comments and docs (`CLAUDE.md`, `DESIGN.md`) that named `index.css` now point at the file that holds the thing.
- The reduced-motion rule keeps its place at the end of the cascade (`css/global/accessibility.css`, imported last).

Verified by building before and after: the main stylesheet has the same 156 rules and the same 109,318 bytes (only five neighbouring rules trade places, because `.tt-on-tint-muted` now sits with the swatch rules, and it shares no property with them), and the calendar stylesheet is byte-identical. In the dev server the tokens and the calendar mapping resolve in light and dark. `tsc -b` 0, lint 0.

## 2026-09-18 (37)
### Added
- **The database refuses hours without a project (migration `0049`).** `time_entries.project_id` still allows NULL (it has since the first schema), so the "every entry needs a project" rule lived only in the code of each writer. Two triggers now enforce it below all of them: `BEFORE INSERT` and `BEFORE UPDATE OF project_id` abort with "A time entry needs a project" when the project is NULL. Existing rows are not touched, and editing any other column of an entry is unaffected.
- One consequence, on purpose: `project_id` has `ON DELETE SET NULL`, so deleting a project that still has hours is now refused rather than orphaning them. The app never deletes projects (it archives them), and deleting a whole workspace still works.

Checked while writing it: the calendar auto-track insert needs no change. It only inserts a project the inference picked from `loadGroundingProjects`, whose filter (`active = 1 AND client_id IS NOT NULL`) is the one `findActiveProject` applies.

Verified: applied to the local D1 (`wrangler d1 migrations apply --local`), where inserting an entry with no project fails with `SQLITE_CONSTRAINT_TRIGGER`; the API still answers 400 for a missing project, 201 for a valid entry and 200 for its delete. Tests on a real in-memory SQLite (insert, insert with an explicit NULL, clearing the project, moving to another project, editing other columns, deleting a project with and without hours, deleting a workspace). Not applied to the remote database. `tsc -b` 0, lint 0.

## 2026-09-18 (37)
### Added
- **The database refuses hours without a project (migration `0049`).** `time_entries.project_id` still allows NULL (it has since the first schema), so the "every entry needs a project" rule lived only in the code of each writer. Two triggers now enforce it below all of them: `BEFORE INSERT` and `BEFORE UPDATE OF project_id` abort with "A time entry needs a project" when the project is NULL. Existing rows are not touched, and editing any other column of an entry is unaffected.
- One consequence, on purpose: `project_id` has `ON DELETE SET NULL`, so deleting a project that still has hours is now refused rather than orphaning them. The app never deletes projects (it archives them), and deleting a whole workspace still works.

Checked while writing it: the calendar auto-track insert needs no change. It only inserts a project the inference picked from `loadGroundingProjects`, whose filter (`active = 1 AND client_id IS NOT NULL`) is the one `findActiveProject` applies.

Verified: applied to the local D1 (`wrangler d1 migrations apply --local`), where inserting an entry with no project fails with `SQLITE_CONSTRAINT_TRIGGER`; the API still answers 400 for a missing project, 201 for a valid entry and 200 for its delete. Tests on a real in-memory SQLite (insert, insert with an explicit NULL, clearing the project, moving to another project, editing other columns, deleting a project with and without hours, deleting a workspace). Not applied to the remote database. `tsc -b` 0, lint 0.

## 2026-09-18 (36)
### Added
- **A test that runs the real SQL for "removing a member takes them off the tasks" (D6).** The existing tests only compared the SQL text a stub received. `src/test/sqlite-d1.ts` now gives tests a real in-memory SQLite with every migration applied, behind the slice of the D1 API the worker uses (`prepare/bind/run/all/first`), and `removeMemberFromTasks` is tested against it: the person disappears from every task they were on, other people's assignments stay, their notifications in that workspace go, the same person's assignments in another workspace stay, and their tracked hours are kept. Nothing in the worker changed.
- The helper reads the migrations with `import.meta.glob` and declares only the `node:sqlite` surface it uses (`src/test/node-sqlite.d.ts`, added to `tsconfig.worker.json`), so the worker project still has no Node typings.

Verified: with the assignee `DELETE` switched off the tests fail (2 of 4), restored they pass. All 48 migrations apply to the in-memory database. `tsc -b` 0, lint 0.

## 2026-09-18 (35)
### Added
- **Owners and admins can delete any comment, and long threads load in pages (D8).** Deleting a comment was author-only, so a stray or wrong comment could only be removed by whoever wrote it. `DELETE /:id/comments/:commentId` now follows the same author-or-manager rule as attachments (`canDeleteComment`); editing stays author-only. The panel shows the delete button to the author or a manager, and only the author gets the edit button. `GET /:id/comments` returns the newest 100 (`limit` up to 200) and takes `before=<commentId>` for the ones older than it; the panel shows "Load earlier comments" while a page came back full, and the MCP `list_task_comments` tool takes the same `limit`/`before` (its description no longer says "every comment").

### Fixed
- Comments written in the same second keep their order across pages: the paging tie-break is the row's insertion order (`rowid`), not the random comment id, which had shuffled them on the older page.

Verified against the local D1 and in a real browser with 105 comments on one task: the first page held the newest 100 in order, `limit=10&before=` returned exactly the 6 older ones with no overlap, `limit=500` answered 400, "Load earlier comments" appeared, loaded the rest and then disappeared, and the owner deleted a comment written by another member. A plain member's 403 is covered by route tests only (the seeded member cannot sign in here). Route tests for author, owner, admin, non-member and missing comment on delete, and for the paging SQL and its limits. `tsc -b` 0, lint 0.

## 2026-09-18 (34)
### Fixed
- **The task panel follows edits made elsewhere (D5).** The panel copied the task's name and estimate into local state only when the task id changed, so a rename by a teammate (or from the MCP, the Assistant or another tab) never showed while the panel stayed open. Both fields now go through `useSyncedField`: they follow the server's value unless the person has typed something of their own, and start over when another task opens.

Verified in a real browser: with the panel open, a `PUT /api/tasks/:id` rename showed in the title without reloading; with the title being typed in, a second remote rename left the typed text alone. Unit tests for the hook (follows the server, keeps a local edit, resets on a new key, resumes following after the edit matches the server). `tsc -b` 0, lint 0.

## 2026-09-18 (33)
### Added
- **D7: images can be attached from the task panel.** The Attachments section had no way in (images only arrived by pasting or dropping into the description or a comment, and the gallery was read-only). It now has an **Attach image** button (several files at once), accepts files dropped on the whole area, shows a spinner and disables the button while uploading, and says how to add images when there are none. One rule for every way an image gets in: `imageProblem` (png, jpeg, webp or gif, up to 10 MB) replaces three copies of the same check in the sheet, the comment composer and the comment editor.

Verified in a real browser against the local R2: choosing 2 images stored 2, choosing a `.txt` stored none and toasted "Only PNG, JPEG, WebP and GIF images are accepted", dropping a file stored a third; deleting the task removed its attachments. Component tests (button, several files, wrong type, over 10 MB next to a valid one, drop, busy state, a failed upload not stopping the next) and unit tests for `imageProblem`. `tsc -b` 0, lint 0, vitest 578/578.

## 2026-09-18 (32)
### Added
- **The board card shows how many comments a task has (D8).** A comment chip (speech bubble and the number) sits next to the subtask count on every card that has at least one comment, with a tooltip ("3 comments"). The count comes from the task list query itself (`comment_count`, one indexed subquery per task; `Task.commentCount`), so it costs no extra request, and it updates live: posting or deleting a comment, or another person's comment arriving over the socket, refetches the task list.

Verified in a real browser: a task with 2 comments showed `2` (title "2 comments"), a task with none showed no chip, and a third comment posted from outside the page turned it into `3` with no reload. Route test that `commentCount` is mapped from the query and defaults to 0. `tsc -b` 0, lint 0, vitest 568/568, build ok.

## 2026-09-18 (31)
### Fixed
- **The comments and the comment field are two separate blocks.** A line inside one frame still read as a single thing (the field looked like part of the last comment). The conversation keeps its frame and the field has a frame of its own 16px below it (same border and radius: neither glued to the messages nor loose on the panel). With no messages yet, only the field's frame shows. Replaces the separator-inside-the-frame layout from the entry above.

Verified in a real browser with three comments, light and dark: the field's frame is a different element from the messages' frame and 16px below it. `tsc -b` 0, lint 0, vitest 567/567, build ok.

## 2026-09-18 (30)
### Fixed
- **The comment field no longer sits glued to the last message.** Inside the conversation's frame the field was one hairline and 10px away from the last comment. It is now set apart by the `Separator` component with space around it (12px above the line inside the frame's rhythm, 16px below it) and a roomier field block (`px-4`, `pb-3`). With no messages yet the frame holds just the field.

Verified in a real browser with three comments, light and dark: last message → line 12px, line → field 16px (screenshot checked). `tsc -b` 0, lint 0, vitest 567/567, build ok.

## 2026-09-18 (29)
### Fixed
- **Dark mode: the subtask field and the Estimate field no longer show a lighter box of their own.** The base `Input` carries `dark:bg-input/30` (a white veil of about 4%); the quick-add row and the Estimate field passed `bg-transparent`, which a `dark:` class beats, so in dark the field was a different tone from the row behind it (the row's own hover/focus colour) while in light it was flat. Both now also pass `dark:bg-transparent` (and the Estimate keeps its hover colour in dark). This was not caused by the dark Backlog column change (a different token, and a different surface).

Verified in a real browser, light and dark, on the focused subtask field: input background is transparent and the row keeps its own colour (before: `oklab(1 0 0 / 0.039)` over the row's `bg-accent/50` in dark); the Estimate field is transparent in both. `tsc -b` 0, lint 0, vitest 567/567.

## 2026-09-18 (28)
### Added
- **A person tagged in the task title is drawn as a red, clickable chip.** The name stays plain text (`... com @Ana`), so it costs nothing in cards, reports and exports; in the sheet, while the title is not being edited, each `@Name` that matches a member becomes the same chip the comments and the description use, and clicking it opens the person's profile. Clicking the words (or Tab) turns the title back into the field with the caret at the end; leaving the field saves and shows the chips again. `splitPlainMentions` (shared) does the matching.

Verified in a real browser: after `@gra` + Enter, Enter the title showed a chip in the primary colour on a light tint at 40px, the stored name was still plain text, clicking the chip opened the profile, clicking the words opened the field focused with the name intact. Component tests for the chip view, the profile, starting an edit and saving on blur. `tsc -b` 0, lint 0, vitest 567/567.

## 2026-09-18 (27)
### Changed
- **The comment field lives inside the conversation's frame, starts taller and grows without scrolling.** The messages and the field now share one bordered frame, the field behind a divider (it read as loose, outside the messages, in dark mode). It starts about three lines tall (72px, was one line), grows with what is typed, and has no scrollbar and no drag handle to resize (`Textarea` variant `bare`: `min-h-18`, `resize-none`, `overflow-hidden`, same self-measuring fallback as the title).

Verified in a real browser, light and dark: the field sits inside the frame that holds the messages; 72px empty, 121px with six lines with `scrollHeight` = `clientHeight`, `overflow-y` hidden, `resize` none. Component test for the variant. `tsc -b` 0, lint 0, vitest 560/560.

## 2026-09-18 (26)
### Fixed
- **The task title no longer scrolls.** Its box was 1px shorter than its text (the fixed 50px line height leaves the content at 51px) and it had `overflow-y: auto`, so even a one-line title could scroll (a scrollbar on Linux/Chrome, a 1px shift from the keyboard). The `title` variant is now `overflow-hidden` with `pb-px` so the box is exactly as tall as the text and always grows to fit; where the browser lacks `field-sizing: content`, `Textarea` measures itself instead.

Verified in a real browser with one-, two- and five-line titles: `overflow-y` hidden, `clientHeight` = `scrollHeight` (51/51, 101/101, 251/251) and `scrollTop` 0 after Ctrl+End and a mouse wheel. Component test for the variant. `tsc -b` 0, lint 0, vitest 560/560.

## 2026-09-18 (25)
### Fixed
- **"Add a subtask": the `+` is a real button and the assign button is always visible.** The `+` at the left of the quick-add row was decoration; it now adds what is typed (like Enter) or, with nothing typed, puts the cursor in the field. The dashed assign button in that row was hover-only in both themes because `AssignButton` carried `tt-reveal`; it has a `reveal` variant now (`hover` stays the default for dense rows and board cards, `always` for a row whose job is to fill it) and the quick-add uses `always`, at full muted-foreground contrast.

Verified in a real browser on a hover-capable device, light and dark: the assign button in the quick-add row has opacity 1 with no hover (dashed border, contrast from `muted-foreground`), typing a name and clicking `+` created the subtask through the API, an empty `+` focused the field. Component tests for the `+` and for the `reveal` variant. `tsc -b` 0, lint 0, vitest 559/559.

## 2026-09-18 (24)
### Changed
- **The comment composer is a divider and a field, not a box.** The bordered, rounded box around the comment field is gone: a single line separates the feed from the field, the field has no border or fill (new `Textarea` variant `bare`), and the Comment button sits right under it. Closer to ClickUp's calm composer.

Verified in a real browser (screenshot of the Comments tab); component test for the `bare` variant. `tsc -b` 0, lint 0.

## 2026-09-18 (23)
### Added
- **@ works in the task description and in the task name.** In the description (the TipTap editor) `@` opens the team beside the caret; picking one writes a chip (a `mention` node saved with the person's id) that stays after a reload and opens the person's profile when clicked. Saving the description notifies only people **newly** tagged (not the ones already there, not the author), with a link to the task; a mention also reads as `@Name` in the board card preview and in the MCP's plain-text description. In the task name, `@` lists the team and writes the picked name as **plain text**: a name has no tags, chips or notifications, because it is shown in cards, reports and exports. The list, the search and the profile card are shared with the comments (`MentionOptions`, `filterMembers`, `MemberProfile`). New dependencies: `@tiptap/extension-mention` and `@tiptap/suggestion` (3.31.3, same as the rest of tiptap).

Verified in a real browser: `@gra` in the description listed the person, Enter wrote the chip, blur saved a `mention` node with the id, after a reload the chip was still there and a click opened the profile; in the name `@gra` + Enter wrote `... com @Grader Member` and the next Enter saved it. Route tests for who is notified from a description (new tag, already tagged, author, none), unit tests for `docMentions` and `filterMembers`. `tsc -b` 0, `pnpm lint` 0, vitest 559/559, `pnpm build` ok.

## 2026-09-18 (22)
### Fixed
- **The task panel's title renders at the size the styleguide gives it.** DESIGN.md §3 defines the task sheet's title as Display (40px), but it measured **14px** on desktop. Two causes: the title was an `Input` whose base carries `md:text-sm`, and `tailwind-merge` did not know `text-display` is a font size (it read it as a colour, exactly the trap `text-micro` had), so neither `text-base` nor `md:text-sm` was ever dropped. `cn` now knows `display`; `Textarea` gains a `title` variant (bare, wraps, display step on every breakpoint) and the panel title uses it, so a long name wraps instead of clipping and Enter confirms. The description's own `h2` was 14px, *smaller* than its 18px paragraph; it is now the Title step (20px). The sheet is `max-w-xl` (576px) so a 40px title has room.

Verified in a real browser: title 40px, description `h2` 20px, panel 576px; a 100-character name wraps to 4–5 lines without clipping; Enter saves and adds no newline. New tests for `cn` with `text-display` and the `title` variant. `tsc -b` 0, `pnpm lint` 0, vitest 516/516. The description paragraph (18px) is unchanged: it was already large.
## 2026-09-18 (21b)
### Added
- **Tagging a person in a comment now happens inside the text.** Typing `@` next to the words lists the team beside the field (arrow keys, Enter/Tab or a click pick; Esc closes only the list), and the chosen name is written into the comment where the `@` was. The stored body uses a tag, `@[Name](user:ID)` (`shared/mentions.ts`), and the comment draws it as a clickable chip that opens the person's profile (avatar, name, e-mail, role). The separate "Mention" button under the field is gone. The **server** now reads who is tagged from the text (validated as workspace members) and still honours `mentionedUserIds`, so the MCP tool keeps working; a chip always shows the member's own name, never the name written in the tag, and a tag for someone who left is plain text. The MCP tool descriptions, the server instructions and the chat prompt teach the tag. Edit mode turns tags back into `@Name` and back again on save; two people with one name stay apart because the list remembers who was picked. Descriptions (the TipTap editor) are not part of this change.

Verified: tag/encode/decode round-trips and injection cases in unit tests; route tests for tags in the text, a non-member id and the MCP ids; component tests for the chip, the profile, the list, keyboard picking, Esc not closing the panel, and a repeated team list; in a real browser `@de` listed the team, Enter wrote `@Demo User`, the comment stored `@[Demo User](user:…)`, rendered as a chip and the click opened the profile; through the MCP `add_task_comment` with a tag stored the person in `mentionedUserIds`. `tsc -b` 0, `pnpm lint` 0, vitest 541/541, `pnpm build` ok.

## 2026-09-18 (21)
### Fixed
- **Switching the Task/Comments tab (or opening a card) no longer reloads the page behind the sheet.** `AppShell` keyed the page container by the full `pathname`, and once the tab and the open task lived in the URL every tab click remounted the whole board with a fade. The container is now `PageFrame`, keyed by the route *section* (`lib/routeSection.ts`), so a page still fades in when you change page but opening a task or switching its tab keeps it mounted. Regression from the shareable-URL change.

Verified: a component test mounts the real `PageFrame` and counts page mounts (1 across task → comments → task; 2 when the section changes) and fails with the old key (4 mounts) — checked by putting the old key back; in a real browser a marker set on the board's rail survived opening a card, both tab clicks and closing the sheet. `tsc -b` 0, eslint 0.

## 2026-09-18 (20)
### Changed
- **Every workspace has the same seven task statuses: Backlog, On hold, Pendente, Em progresso, QA, Client review, Closed.** A new workspace already got them (`DEFAULT_STATUSES`), but databases that predate that were seeded by migration 0038 with five (Backlog, To do, In progress, Feedback, Done) and could have been edited since. Migration `0047` brings any of them to the seven: a live status that already has a canonical name is normalised (colour, category, position), missing ones are created, tasks in any other workspace-wide status move to the closest one (To do → Pendente, In progress → Em progresso, Feedback → Client review, Done → Closed, anything else by category), the leftovers are archived — not deleted — and Pendente is the single default. A project's own fork is left alone. `lib/task-statuses.test.ts` checks the migration's literals against `DEFAULT_STATUSES` so the two cannot drift.

Verified on the local D1, which is messy on purpose (4,757 workspaces from e2e runs: some with the old five, some with the seven, one with "Blocked", one with a lowercase "to do"): afterwards all 4,757 have exactly the seven with one default; the 2,309 tasks are all still there and every count adds up (Pendente 1,466 = 882 + 584 from "To do", Closed 484 = 231 + 253 from "Done"…); no task points at an archived status and none is without one. `0047` had first failed on D1's compound-SELECT limit, so the seven inserts are separate statements. Migration `0048` clears the default flag 0047 left on archived leftovers (the app clears it when it archives a status). **Remote D1 needs `npx wrangler d1 migrations apply time-tracker --remote` (0046, 0047, 0048) before this code is deployed** — applied to production on 2026-09-18 after a full `d1 export` backup; production had one workspace with the old five and five tasks, all of them kept (Backlog 2, Pendente 3).

## 2026-09-18 (19)
### Added
- **A task's comments tab now shows what changed on it, like ClickUp.** Status changes (from the sheet, the checkbox, or a board drop), due date, priority and assignees appear between the comments as quiet lines ("Luis changed status from To do to In progress · 2 minutes ago"). New table `task_activity` (migration `0046`; names are stored, not ids, so a renamed status or a departed member still reads right), written by `PUT /tasks/:id` and `PATCH /tasks/:id/move` only when a value actually changed, read by `GET /tasks/:id/activity`, refreshed live for other sessions through the existing `task-comments:changed` broadcast. Deleting the task deletes its history. Recording is best-effort: if it fails (for instance the migration has not reached a database yet) the error is logged and the edit still succeeds.
- Also fixes two lint errors from the optimistic-comment change (an unused destructured variable and an `onError` that discarded its argument): the failure toast now lives in the composer, which also owns restoring the text.

Verified: migration applied to the local D1 only. API run: a status change, a due date + priority, an assignee added then removed and a board move each wrote one line, repeating the same value wrote nothing, an unknown task answers 404, and the history disappears with the task. In a real browser the comment appeared 382 ms after clicking Comment, and a status/priority/due-date change made from another session showed up in the open sheet within 2.5 s. `tsc -b` 0, `eslint src` 0, unit tests for the sentence builder. **Remote D1 still needs `npx wrangler d1 migrations apply time-tracker --remote` before this reaches production.**

## 2026-09-18 (18)
### Added
- **The Assistant and the MCP give links to what they touched.** Task, comment and time-entry results now carry a `url` (`mcp/links.ts`; a task opens its tab, a comment its comments tab, an entry the Timer on its day via the new `/?date=YYYY-MM-DD`). The panel shows those links under each tool result straight from the data — not left to the model, which (glm) ignored a prompt rule to add them — and its markdown renders `[text](url)` too: same-origin links navigate inside the app, other `https` links open in a new tab, anything else (`javascript:`) is plain text. The MCP instructions and the chat prompt tell a model to hand the `url` over. Entry links use the entry's UTC date, so near midnight they can land a day off — the week view still contains the entry.

Verified: MCP `list_tasks` returns `url`; in a real browser the panel listed the task as a link and clicking it opened `/tasks/<id>`; `/?date=2026-03-10` opens the week of 9 March and an invalid date falls back to the current week. New unit tests for links, `appPath`, the markdown links, `linksOf` and `parseDateParam`; `tsc -b` 0, eslint 0.

## 2026-09-18 (17)
### Changed
- **Settings hides the Calendar sync card when no calendar provider is configured** instead of showing a card that says so. The code stays: the card appears again as soon as the server configures Google or Microsoft. It also stays hidden while the status loads, so it no longer flashes and disappears.

Verified in a real browser: with the provider status forced to `configured: false` the card and the "isn't configured" text are gone and the rest of the tab is intact; with the local server's real status (both configured) the card is shown. `tsc -b` 0, eslint 0.

## 2026-09-18 (16)
### Fixed
- **Dark mode: board columns are a step lighter than their cards.** A column was its swatch at 6–10% over the page background, which for Backlog's low-chroma slate landed at the same lightness as the card on it (measured ~0.222 vs 0.228 in oklab), so the card vanished. In dark the column now mixes the swatch into `--muted` (`.dark .tt-swatch-column`); light mode is unchanged. Every column keeps its hue.

Verified in a real browser with the dark class: column lightness 0.296–0.309 against the card's 0.228 in all five columns; screenshot checked by eye.

## 2026-09-18 (15)
### Fixed
- **The project picker's default trigger has a tooltip.** In compact form an unselected picker is a folder icon and a chevron with nothing saying what it is (the Timer header's project button). `ProjectPicker` now wraps its own trigger in a tooltip ("Select project" / "Project: <name>"); a caller that passes its own child keeps owning its labelling.

Verified in a real browser: hovering the Timer header's project button shows the tooltip and a click still opens the picker. `tsc -b` 0, eslint 0.

## 2026-09-18 (14)
### Fixed
- **Tasks rail: clients and projects are the same size and their "…" buttons line up.** A client row was a small `text-xs` heading inside a `px-2` wrapper while a project row was a full `text-sm` row, so the action buttons sat at different x positions. `TaskRailRow` is now the one row for "All tasks", clients and projects (fixed icon slot, same padding, an always-reserved actions column) and `RailActionsMenu` the one Edit/Archive menu, with a tooltip. Clients keep a users icon and a heavier label so they still read as headings.

Verified in a real browser: every row is 32 px high and starts at the same x, and the "…" buttons of client and project rows end at the same x. `tsc -b` 0, eslint 0.

## 2026-09-18 (13)
### Fixed
- **Dragging a board card no longer paints the whole column grey.** The drop region is full column height (so an empty column still accepts a drop) and it tinted itself `bg-muted/60` while a card hovered over it, which read as a shadow running to the bottom. The tint is gone; the dimmed placeholder card already shows where the drop lands.

Verified: cause read in `TaskBoardColumn.tsx` (`isOver` → `bg-muted/60` on a `flex-1` region); `tsc -b` 0, eslint 0. Not re-checked by eye during a live drag.

## 2026-09-18 (12)
### Added
- **Every task state has a link.** `/tasks/:id` opens the task tab and `/tasks/:id/comments` the comments tab; switching tabs, opening a card or a subtask, and closing the sheet all change the URL (`tasks/:id?/:tab?`, helpers in `shared/task-links.ts`, used by both sides). The sheet is now driven by the URL instead of local state, so a copied link reopens exactly there. A link to a task that doesn't exist or isn't visible lands on `/tasks` with a toast. A mention notification now opens the comments tab; assignment and status notifications open the task tab.

Verified in a real browser (Playwright against the dev server): open `/comments` directly → Comments tab; tab clicks rewrite the URL both ways; a subtask link and its comments tab; unknown id → `/tasks` + toast; clicking a card → `/tasks/:id`; closing → `/tasks`. `tsc -b` 0, eslint 0, unit test for the link helpers.

## 2026-09-18 (11)
### Fixed
- **The Assistant logs the time the person asked for.** "Start at 10" was saved as 07:00: the chat prompt told the model to send UTC and it sent `10:00Z`, which the app shows as 07:00 in UTC-3. The prompt now gives the person's offset (`isoOffset`) and asks for local time *with* it (`2026-09-18T10:00:00-03:00`), which the tool already accepted. Also: "say X on that task" means a comment (glm had overwritten a task's description), and optional fields the person didn't mention (`billable`) are no longer invented.

Verified through the app's chat socket: "2 horas no projeto API Development, comecei as 10" produced `log_time` with `start 2026-09-18T10:00:00-03:00`, `stop 2026-09-18T12:00:00-03:00`; unit test for `isoOffset`.

## 2026-09-18 (10)
### Fixed
- **Comments and notifications no longer read as "in about 3 hours".** SQLite's `datetime('now')` is UTC with no zone marker, and the browser parsed the bare string as local time, so anyone west of UTC saw comment and notification times in the future. `lib/sqlite-time.ts` marks them UTC (`...Z`) at the API boundary for task comments (`createdAt`, `editedAt`) and notifications. Other `created_at` fields in the API have the same shape but are not shown as a time on any screen, so they are untouched.

Verified: `POST /api/tasks/:id/comments` returned `createdAt: "2026-09-18 17:47:12"` against `now: 2026-09-18T17:47:12.992Z` (proves the missing marker); new unit test on the converter.

## 2026-09-18 (9)
### Fixed
- **Posting a task comment no longer freezes.** The composer waited for the POST, then for a second round trip (`invalidate` → refetch) before the comment appeared, which on the remote D1 read as a hang. The comment is now inserted into the cache the instant it is sent and the box clears at once; a failure removes it, puts the text back and toasts. The row shows no edit/delete until the server confirms it.

Verified: local POST measured at ~26 ms warm, so the wait was the two serial round trips, not the handler. `tsc -b` 0.

## 2026-09-18 (8)
### Changed
- **The Assistant chat runs on `@cf/zai-org/glm-4.7-flash` instead of Llama 4 Scout.** With the 64-tool
  catalog Scout chose the wrong tool most of the time ("list my tasks" called `run_report`) and
  sometimes answered empty or wrote the call as text. Only `ChatAgent.ts` changed; quick-add, recolor and
  drafting stay on Scout (they need `json_schema`). Numbers and caveats in `docs/IA.md`.

- The chat prompt now says "this week" is Monday to Sunday and to call a tool once per need: glm asked
  "which day does your week start?" instead of calling `get_time_summary`, and repeated `list_tasks` 4x.

Verified: bench of 4 prompts x 3 runs on the real tools — glm 9/12, gpt-oss-20b 7/12, Scout 5/12.
Through the app's real chat socket (demo login): "me liste minhas tasks" -> `list_tasks` once,
"quantas horas eu lancei essa semana?" -> `get_time_summary`, "marque o luis numa tarefa…" ->
`list_tasks` + `list_members`, no `[tool(...)]` text; the UI already skips `reasoning` parts.
`tsc -b` 0, eslint 0, vitest 480/480. Not covered: the approval click on a write tool, real data.

## 2026-09-18 (7)
### Changed
- **The new-key card now offers a setup per client, not just Claude Code.** Tabs for Claude Code
  (unchanged), Cursor / Windsurf / VS Code (`mcpServers` JSON), Claude Desktop (`mcp-remote`, key in
  `env` and no space after the header colon, as in `docs/MCP.md`) and any other AI (URL, transport,
  header, and a whoami check). Each tab has its own copy button. API keys stay accepted only on `/mcp`,
  not on `/api/*`: the MCP catalog already covers the app, and a second door would widen the surface.

Verified: `tsc -b` 0, eslint 0 on the touched files, `mcpSetupPrompt.test.ts` 5/5 (3 new).

## 2026-09-18 (6)
### Changed
- **CI runs only the quality job** (`.github/workflows/ci.yml`: install, typecheck, lint, build, vitest
  with coverage). Playwright left CI at Luis's request — it stalled and cost minutes per push; the
  specs stay in `e2e/` for `pnpm test:e2e` by hand.

Verified: workflow file reviewed; takes effect on the next push.

## 2026-09-18 (5)
### Changed
- **One tool catalog for the MCP server and the in-app Assistant.** `mcp/registry.ts` registers every
  tool once; `mcp/server.ts` serves it over MCP and `mcp/chat-tools.ts` turns the same definitions into
  AI SDK tools for the chat, so a tool added to the MCP reaches the Assistant with no porting. In the
  chat every non-read-only tool waits for the user's approval. The Assistant keeps only three
  chat-only tools (`trackMeeting` — now through the app's own route — `rememberPreference`,
  `searchMemory`); its old duplicates (startTimer, stopTimer, logTimeEntry, getTimeSummary,
  listProjects, deleteEntry, listMyTasks) are gone.
- **Timers are app-only.** `start_timer`, `stop_timer` and `start_favorite` were removed from the MCP
  (64 tools: 25 read + 39 write); logging and editing entries cover what an AI needs.
- **Every MCP tool scores 10/10 on a live grader** (`tools/mcp-grade.mjs`): description, every input
  field documented (`FIELD_DOCS` applied centrally), correct annotations, called for real and
  succeeding, compact output (UI keys stripped), refusals returned with `isError`. `log_time` goes
  through the app's route and returns the entry id; `list_tasks` gained `dueBy` for "what do I have
  today".
- The MCP connector card shows a **Claude Code setup prompt** after a key is created: it registers the
  server with the key and installs a `/tracking` skill.
### Fixed
- **One unanswered approval broke the whole chat** (`MissingToolResultsError` → "An error occurred" on
  every later message). Tool calls left open before the latest user message are now closed as denied
  or interrupted (`lib/assistant-messages.ts`).
- **The Assistant answered Portuguese questions in English**: Scout follows the language of the last
  thing it read (an English tool result), so the reply language is detected and restated on every step.
- **Assigning a task to someone with a duplicate `member` row crashed with a 500** (`UNIQUE constraint
  failed: task_assignees`): `currentMemberIds` now selects `DISTINCT`. Production has no duplicates
  (checked read-only); the local seed does.

Verified: `npx tsc -b` 0, `pnpm lint` 0, `pnpm test` 477/477; `node tools/mcp-grade.mjs` against
`pnpm dev` with owner, read-only and member keys → "GRADE: all 64 at 10" and 4/4 global checks (read key
sees only reads; member gets the app's refusals on `update_project` and `delete_task`); through the
real chat socket, "o que tenho pra hoje?" called `list_tasks` (assignee me, dueBy today) and answered in
Portuguese, "crie uma tarefa…" stopped at the approval request with the right project and date, and a
thread stuck on an unanswered approval answered again. Measured chat cost: the 64 tools add ~17,900
prompt tokens (~440 neurons) per model call (`docs/IA.md`). The touched e2e specs run in CI.

## 2026-09-18 (4)
### Fixed
- **The Assistant doubled every word and every tool call failed ("An error occurred").** Workers AI
  streams each chunk in two shapes at once (legacy `response`/`tool_calls` and OpenAI-style
  `choices[0].delta`), and `workers-ai-provider` 3.3.1 — and 4.0.0 — emits both. Text came out
  twice and tool arguments were concatenated into invalid JSON, so the SDK passed `{}` to the tool.
  `lib/workers-ai-stream.ts` wraps the chat's AI binding and drops the legacy copy whenever `choices`
  is present. See `docs/IA.md`.
### Added
- Assistant tool `listMyTasks`: the person's open assigned tasks due by their local today (overdue
  included, optional days ahead), so "what do I have today" has an answer. The Assistant now
  replies in the language the user wrote in.

Verified: raw Scout stream shows both shapes in every chunk; `streamText` against the real model
failed to parse all 3 tool calls without the wrapper and called the tool with correct arguments
with it, in Portuguese and English; through the app's real chat socket, "quantas horas eu lancei
hoje?" called `getTimeSummary` and "o que tenho pra hoje?" called `listMyTasks`, both with clean
text. `tsc -b` 0, `pnpm lint` 0, `pnpm test` 470/470 (3 new for the stream rewrite).

## 2026-09-18 (3)
### Added
- **The MCP server covers the app's day-to-day work: 67 tools, up from 15.** Tasks (list, read, edit,
  delete, statuses, comments, image attachments), time entries (read, edit, delete, copy a week, the
  Reports queries), tags, project and client edits/archiving, favorites (including starting one),
  recurring entries in local weekday/time, saved reports, the Planner, notifications, the key owner's
  settings and calendar auto-track. Members and API keys are listed read-only; inviting, removing
  and key management stay in the app. New tools run through `mcp/rest-bridge.ts`, which mounts the
  app's own routers with the key's workspace and person, so a tool gets exactly the screen's
  validation, role checks and broadcasts instead of a second copy of them. `server.ts` was split into
  `mcp/tools/*` by subject; the 15 existing tools keep their names and behaviour.
### Fixed
- **Editing a project reset its `billable` flag, and pausing a recurring entry wiped its description
  and tags.** zod 4's `.partial()` keeps `.default()`s, so `UpdateProjectSchema` always carried
  `billable: false` and `UpdateRecurringEntrySchema` `description: ""`, `tags: []`, `billable: true`.
  The same default also meant a member could never fill in a project's missing client (the
  "exactly one field" check never matched). Update schemas are now built from default-free fields.
- **AI quick-add put times six hours off for anyone west of UTC.** The prompt passed the JS
  `getTimezoneOffset` value as "UTC offset 180 minutes", which a model reads as UTC+3. It now states
  the local wall-clock time and a `UTC-03:00` label.
### Changed
- Recurring schedule conversion (local ↔ UTC) moved to `src/shared/recurring-schedule.ts` with the
  offset as a parameter, shared by the dialog and the MCP.

Verified: `npx tsc -b` 0, `pnpm lint` 0, `pnpm test` 467/467; against `pnpm dev` with a `read_write`
key, an MCP client listed 67 tools and called each new one end to end (create → edit → delete of a
task, comment, attachment, entry, tag, favorite, recurring entry, planner cell) with no error, and
`update_project` with only `name` kept `billable`; quick-add of "das 14h às 15h ontem" at UTC-3
returned 17:00Z–18:00Z twice (was 11:00Z). Not yet run: the full e2e suite.

## 2026-09-18 (2)
### Changed
- **Every screen now composes the design-system primitives instead of restyling them.** The four
  hand-made colour pickers became one `ColorSwatchPicker` (selection by outline, check ink by
  contrast — two of them used `ring`, which means focus in this app, and one drew a white check that
  vanished on light swatches); every hand-rolled checkbox became `Checkbox`, including the tri-state
  select-all; avatars, stacks (now showing `+N`) and the dashed assign button became `Avatar`,
  `AvatarStack` and `AssignButton`; chip ✕, menu trash, search fields, durations and legend squares
  use their primitives. The approved visual changes were exactly those: one picker look, mono
  durations and a round ✕, the danger card as a wash instead of a red border, the quick-add assign
  button dashed, and the dragged card as wide as its column.
- **No screen file is above ~300 lines any more.** Twenty-two components were split into a controller
  that owns hooks and mutations plus pure view pieces — `TaskSheet` 625 → 287, `EntryRow` 551 → 281,
  `TaskBoardList` 583 → 296, `ToolCard` 365 → 41 — with pure helpers moved to `lib/` under unit tests.
  Timesheet and Planner share one `WeekGrid`; shared forms moved to `components/forms/` and shared
  pickers to `components/pickers/`, so a feature no longer imports another feature's internals.
- **Forms validate with the server's own schemas.** `ProjectForm`, `ClientForm`, `IntegrationForm` and
  the recurring-entry dialog run on React Hook Form with `zodResolver` over `@shared/schemas`, so the
  message under a field is the same one the API would return.
- **Every destructive action without an undo asks first** through the shared `ConfirmDialog`: comments,
  attachments, saved reports, favourites, notifications, passkeys, recurring templates, calendar
  disconnect, archiving clients and projects, and removing a workspace member (who keeps their logged
  hours). Time entries keep their undo toast, as decided.
- **The design rules are build errors now.** Empty `.catch`, `onError` without its argument, raw hex or
  Tailwind palette colours, resting shadows, arbitrary pixel sizes and hand-copied focus rings fail
  `pnpm lint`; each legitimate exception carries a one-line reason. Each scope spreads its full rule
  set because a flat-config `no-restricted-syntax` replaces, never merges. The worker's reinvented
  neutral fallbacks now come from `NEUTRAL_SWATCH`, and the "Client review" status seed uses the
  palette's pink instead of an off-palette hex.
### Fixed
- The recurring-entry dialog's Create button had become enabled with no project chosen during the form
  migration; it is gated again.

Verified: `npx tsc -b` exit 0, `pnpm lint` exit 0 with the rules as errors (a probe file with one
violation of each rule fails all six), `pnpm test` 467 passed, `pnpm build` exit 0, `npx playwright
test` 130/133 — the three failures were `database is locked` during sign-up under two workers and pass
when rerun; one intermittent (`task-planning.spec.ts:24`, stop from a task card) passes 5/5 alone and
is tracked in `plano.md` with its evidence.

## 2026-09-17 (11)
### Changed
- **The front-end now gets its types from the worker's routes.** `src/react-app/lib/http-clients.ts`
  builds one `hc` client per router (never a single `hc<AppType>`, which makes `tsc` and the editor
  crawl at this size) and hands it the existing `appFetch`, so the offline queue, the client-id header
  and `ApiError` are untouched. Renaming a field in a route now fails the **front-end** build —
  verified by renaming `trackedSeconds` in `routes/tasks.ts` and watching `tsc -b tsconfig.app.json`
  reject it. The coupling costs about 2.7s on the app's typecheck (10.5s → 13.2s) and is the price of
  the compiler guarding that boundary. WebSockets, `/agents/*`, `/mcp` and the multipart upload stay
  hand-written, each with its reason. The migration also surfaced real drift: entry create/update
  returned `TimeEntry | null` where the handler already guaranteed the row.
- **Every D1 row has a type.** `src/worker/db/rows.ts` declares one interface per table; the
  `Record<string, unknown>` row type went from 65 occurrences to one (a Dynamics request body, not a
  row), the 14 non-null assertions to zero and the 225 field-by-field casts to zero. A JSON column now
  goes through `parseJsonColumn`, which logs when the stored JSON is invalid instead of silently
  returning an empty default.
- **`copy-week` moved to the server.** It used to be N sequential writes from the browser with a
  manual rollback loop, so closing the tab halfway left half a week behind; it is one `DB.batch` now,
  and Undo is a single bulk delete.
### Fixed
- **Failures stopped being silent.** The 45 `onError` handlers that threw the server's message away
  now go through `toastApiError`; six worker fallbacks (the calendar read, four AI paths and the OAuth
  callback) log with context; and a new `POST /api/client-errors` collects browser crashes from the
  error boundaries and from `unhandledrejection`. The duplicated "resolve or infer the project" block
  became one function.
- **The editor no longer loses a pasted image.** The insert position is mapped through a ProseMirror
  plugin instead of being captured before the upload, so typing during the upload cannot misplace it;
  if the target text is deleted meanwhile, the orphaned attachment is removed from R2 and the user is
  told, rather than the image silently vanishing.
- **The offline queue stopped being a trap.** Only time-entry writes queue (comments, statuses and
  attachments were never replay-safe), a 4xx leaves the queue and is reported, a 5xx retries up to five
  times, and only a network `TypeError` counts as "offline". An `Idempotency-Key` was deliberately not
  added: honouring one needs durable dedupe the worker does not have yet, and sending a header nobody
  checks would promise a guarantee that does not exist.
- **Stopping a timer from a task card works every time.** `offerTaskDone` read the task straight from
  the query cache, so under concurrent invalidation it returned early and the "Mark done" prompt never
  appeared — it fetches now. The suite went from failing this in roughly half the runs to 133/133.

Verified: `npx tsc -b` exit 0, `pnpm lint` exit 0, `pnpm test` 356 passed, `pnpm build` exit 0,
`npx playwright test` 133 passed in 4.3 min, exit 0.

## 2026-09-17 (10)
### Fixed
- **Deleting a task only cleaned up its first subtask.** `task_id IN (?, (SELECT …))` is a scalar
  subquery in SQLite, so a parent with three subtasks left the other two subtasks' images in R2
  forever — deleted from the app, still stored. One `taskAndSubtaskIds()` helper now feeds all three
  statements, and an e2e test deletes a parent with three attached subtasks and proves all four
  attachment ids answer 404.
- **Notifications were scoped by user alone.** Someone removed from a workspace kept reading its task
  titles and whole comment bodies from another workspace, and one workspace's notifications showed up
  while another was active. All five routes now filter by `workspace_id` too, `notifyUser` stores a
  140-character excerpt instead of the full comment, a 90-day sweep runs in the cron, and leaving a
  workspace deletes that workspace's notifications for the leaver.
- **An image upload could take the Worker down.** The limit was bytes, not pixels, so a small PNG
  declaring 20000×20000 was decoded in full. Dimensions are now read from the header (PNG, JPEG, WebP,
  GIF) and anything over 8000px a side or 40 megapixels is refused before Photon sees it; the decode
  runs in `try/finally` so WASM memory is always released, and a corrupt image returns 400 instead of
  500.
- **Anyone could delete anyone's task or attachment.** `canDeleteTask`/`canDeleteAttachment` restrict
  it to the author or a workspace manager (migration `0045` adds `tasks.created_by`; a task with no
  recorded author is manager-only), applied in REST and in the MCP tools.
- `assigneeIds` had no length cap, so a single request could exceed D1's 100-parameter limit and fan
  out notifications; it is `.max(50)` now, like mentions. The per-push `console.log` is gone.
### Changed
- **Every logged entry is now born billable.** The project's `billable` flag no longer cascades into
  entries — it stays as the project's own classification (still shown in the project list and the
  assistant's project card). One shared `resolveEntryBillable` covers all sixteen creation paths: the
  timer, manual entry, the calendar, the timesheet grid, drafts, recurring templates, favourites, the
  MCP tools, the assistant tools, the meeting nudge and `useEntryDraft` — the last one being the real
  default behind "Add entry" and clicking an empty calendar slot, which would otherwise have kept
  creating non-billable entries. The inert "Default billable" preference and the project form's
  billable switch are gone.
- **The task panel's header follows the rest of the app**: actions menu on the left, close on the
  right, reusing `SheetContent`'s own close button instead of a hand-rolled one.

Verified: `npx tsc -b` exit 0, `pnpm lint` exit 0, `pnpm test` 318 passed, `npx playwright test
--workers=1` 133 passed in 8.1 min, exit 0 — including four new specs (deletion permissions and the
orphaned-attachment case, notification scoping and excerpt, the forged oversized PNG, and a rewritten
billable spec).

## 2026-09-17 (9)
### Added
- **Unit tests exist now** — vitest with v8 coverage, 259 tests across 12 files, wired into the CI
  `quality` job. The first modules covered are the ones where a wrong answer costs money or hours:
  budget pacing, draft scaling, task recurrence, date/duration formatting and local-day keys,
  UTC↔local recurrence conversion (including the accepted one-hour DST drift), role permissions,
  invite-only gating, rich-text round-trips, image sniffing on forged headers, the SSRF URL guard
  (private ranges, cloud metadata, IPv6 literals) and the API error parser against a real serialized
  zod rejection. `process.env.TZ` is pinned in the config so timezone logic is deterministic on any
  machine, and `src/test/d1-stub.ts` fakes the D1 `prepare/bind/all/first/run` chain instead of
  reaching for a database.
- **Coverage thresholds sit at the measured 28% lines / 31% branches, not the 80% target**, with a
  comment saying so. The covered modules are at 63–100%; the average is dragged down by the files that
  still have no test at all (all of `worker/middleware`, most of `worker/lib` and `react-app/lib`).
  From here each lot tests the modules it touches and raises the floor when it closes, which keeps the
  number honest instead of aspirational.

Verified: `npx tsc -b` exit 0, `pnpm lint` exit 0, `pnpm test:coverage` 259 passed exit 0.

## 2026-09-17 (8)
### Changed
- **The e2e suite is green again and twice as fast** (125 tests, 8 min at one worker, down from 27
  failures in 16 min). The 24 failures were outdated tests, not app bugs, and they shared five causes:
  the Timer tab now opens on Calendar rather than the list (fixed once in a `goToListView` helper used
  by seven specs), Start stays disabled until a project is chosen (specs now pick the project first,
  through the existing `pickProjectInBar`), the default status seed is seven columns so hardcoded
  names collided (specs read the seed or generate a unique name), comments live behind the panel's
  Comments tab, and the due-date popover and the toolbar-less description editor only exist once
  opened (a checklist is typed as `[] text`). `e2e/mcp.spec.ts` no longer pins the production origin.
### Removed
- **The "untracked gap" calendar blocks left the documentation too.** The feature was deleted end to
  end in `2619575` (2026-09-11) but `CLAUDE.md`, `DESIGN.md`, `PRODUCT.md`, `docs/ARCHITECTURE.md` and
  `docs/USER_GUIDE.md` still described it, and a spec still asserted the toggle — which is how a
  removed feature reads as a regression two weeks later. Mentions removed, spec deleted, and a single
  historical note left in `CLAUDE.md` pointing at the commit.
### Fixed
- `e2e/auto-assign-colors.spec.ts` waits up to 30s for the recolor toast: it round-trips through
  Workers AI, which is slow enough under a full-suite run to fail an implicit 5s expectation while
  passing in isolation.

Verified: `npx playwright test e2e/tier2-features.spec.ts e2e/auto-assign-colors.spec.ts --workers=1`
→ 5 passed, exit 0. `npx tsc -b` exit 0.

## 2026-09-17 (7)
### Fixed
- **The assignee-cleanup code from `2026-09-17 (4)` only landed now.** That commit carried the
  changelog entry and nothing else: an agent had run `git stash` to measure a baseline and was stopped
  before restoring it, so `src/worker/lib/task-assignees.ts`, the `auth.ts` hooks, the membership
  checks, migration `0044` and the new spec were all sitting in `stash@{0}` while the commit looked
  complete. Recovered from the stash and shipped. The process fix is in `plano.md`: an agent never
  touches git, and every commit is checked with `git show --stat`.
### Changed
- **The Playwright suite runs with `workers: 1`** — two workers crash Vite's HMR mid-run (`buttonVariants
  is not exported`), which poisons the results — and the task panel specs were rewritten for the panel
  as it is today: the assignee trigger is "Add assignee"/"Edit assignees", the stray `Escape` that used
  to close the whole sheet is gone, and attachments are exercised through
  `POST /api/tasks/:id/attachments` plus the read-only gallery (`Open <file>` / `Delete <file>`),
  because the panel no longer has a file input. A new spec pastes a real image into the description
  editor and asserts it reaches the gallery.

Verified: `npx tsc -b` exit 0, `pnpm lint` exit 0, `e2e/workspace-member-removal.spec.ts` +
`e2e/task-detail-panel.spec.ts` 8/8 green (51.6s, one worker, one dev server). Full-suite triage:
`--workers=2` 97/28, `--workers=1` 98/27; every failure classified in `plano.md` §F9 — 24 are outdated
specs with five root causes, three are flakes, two became new items (P0-8 missing calendar gap blocks,
P0-9 stop-timer from the task card).

## 2026-09-17 (6)
### Changed
- **`pnpm lint` is now `eslint . --max-warnings 0`, and the six warnings it used to carry are gone.**
  Four were `react-refresh/only-export-components`: `badgeVariants`, `buttonVariants` and
  `tabsListVariants` moved to sibling `*-variants.ts` modules and `EMPTY_FILTERS`/`ReportFilters`/
  `BillableFilter` to `components/reports/report-filters.ts`, so a file exports components or
  constants, never both. The other two were `react-hooks/exhaustive-deps` on the running timer and
  were restructured rather than silenced: `TimerBar`'s description debounce reads the latest entry and
  mutation through refs (which also stops a websocket-driven tag/billable sync from restarting the
  debounce), and `useTimer`'s tick effect now tests `runningEntry?.id`, exactly what its dependency
  array already listed.
- **The design-system lint rules are composed from arrays**, with four groups declared in
  `packages/eslint-config/base.js`: the five existing motion/layer/z-index checks stay `error`, and
  the three new groups (empty `.catch`, discarded `onError`, raw hex/Tailwind palette colour, resting
  shadow, arbitrary pixel size, hand-copied focus ring) are declared but switched off until the
  codebase is swept — today's baseline is 52 / 29 / 47 hits. Composition matters because ESLint flat
  config *replaces* rather than merges a rule id where two configs overlap: reusing
  `no-restricted-syntax` for the new checks silently dropped the five existing ones, so each file
  scope has to spread its own full set. Colour exemptions cover the palette and brand sources, the
  email templates (no `oklch()` in mail clients) and the extension's background worker (Chrome's
  badge API takes a literal).
- **CI runs on the branches that exist.** `.github/workflows/e2e.yml` triggered on `push` to `main`,
  a branch this repository no longer has, so nothing ran on any push; it now triggers on `master` and
  `refactor` plus pull requests, and a `quality` job (`install` → `tsc -b` → `lint` → `build`) gates
  the e2e job through `needs`.

Verified: `npx tsc -b` exit 0 and `pnpm lint` exit 0 with `--max-warnings 0`. The timer specs still
have to run against the restructured effects before this lot closes.

## 2026-09-17 (5)
### Docs
- **The hosted Workers Builds pipeline fails for a different reason than this file recorded on
  2026-09-15.** It is not only the missing `dist/client`: its deploy command runs `wrangler` directly,
  and wrangler reads the configuration *before* any build step, so it bundles `src/worker/index.ts`
  from source and cannot resolve the `@shared/*` tsconfig aliases — `Could not resolve
  "@shared/schemas"`, reproduced locally with `npx wrangler versions upload --dry-run` after deleting
  `dist/` and `.wrangler/deploy/`. The build has to complete *before* wrangler starts, so that
  `vite build` has written `.wrangler/deploy/config.json` and wrangler follows the redirect to the
  pre-bundled `dist/tracking/wrangler.json`. Adding `build.command` to `wrangler.jsonc` does not help
  either, and not only because of the ordering: Workers Builds documents that it ignores Wrangler's
  Custom Builds. The remaining fix is a dashboard field (Settings → Build → Build command `pnpm build`,
  or a deploy command pointed at `pnpm run deploy` / `pnpm run versions:upload`), now written into
  `CLAUDE.md` next to the deploy sequence.

## 2026-09-17 (4)
### Fixed
- **BUG-1 — leaving a workspace (or being removed from one) now drops the person as a task assignee,
  and never touches their logged hours.** `task_assignees` only had a foreign key to `"user"`, so
  deleting the `member` row left the assignment behind and the person kept rendering as the task's
  assignee. `removeMemberFromTasks` (`lib/task-assignees.ts`) clears that workspace's rows and
  broadcasts `tasks:changed`; it is wired to the organization plugin's `afterRemoveMember` and — since
  better-auth's `leaveOrganization` never calls that hook — to a top-level `hooks.after` on
  `/organization/leave`. Reads defend themselves too: `assignees_json`, the `assignee` filter and the
  status-change notifier all require a live `member` row, and `validMemberIds` became
  `currentMemberIds` in `lib/permissions.ts` so mentions, assignee writes and notifications share one
  membership check. Migration `0044` prunes the rows left behind before this existed. A former
  member's time entries are deliberately untouched: the per-person report reads the name from `"user"`,
  not from `member`, so their hours stay in every total.

Verified: `tsc -b` exit 0, `pnpm lint` 0 errors, new `e2e/workspace-member-removal.spec.ts` 2/2 green
against a single dev server — both the owner-removes-member and the member-leaves paths assert the
assignee disappears, the task/report/entry-list hours are unchanged and no notification reaches the
former member.

## 2026-09-17 (3)
### Fixed
- **A task whose comment carries an image could never be deleted, and neither could that image.**
  Migration `0043` added `task_comments.attachment_id REFERENCES task_attachments(id)` with no
  `ON DELETE` action, and D1 enforces foreign keys (`PRAGMA foreign_keys` returns `1`), so deleting a
  referenced attachment — alone, or as the first statement of the task-delete batch — failed with
  `FOREIGN KEY constraint failed` and rolled the whole batch back. `0043` now declares
  `ON DELETE SET NULL`; the comment stays and loses its image. Fixed in the migration itself because
  it had not reached the remote database yet — after that, changing the constraint would take a
  table rebuild.

Verified: in-memory SQLite with the real `0040`/`0042`/`0043` — before, both deletes failed with
`FOREIGN KEY constraint failed (19)`; after, the attachment delete nulls `attachment_id` and the
task batch removes task, attachments and comments. Local D1 rebuilt to the same schema (21 comments
preserved). `pnpm check` exit 0, `pnpm lint` 0 errors.

## 2026-09-17 (2)
### Added
- **D8 — flat, single-level task comments**, no reply/thread (same shape as a WhatsApp group chat):
  `task_comments` (migration `0042`), nested under `/api/tasks/:id/comments`
  (`GET`/`POST`/`PATCH`/`DELETE`, author-only edit/delete). `TaskComments.tsx` in the detail panel;
  `@mention` is a structured picker (reuses the same `MultiSelect` as assignees) rather than parsing
  free text, and only ever notifies — it never creates a thread of its own.
- **Per-user notification bell**, a genuinely separate concern from the workspace's `TimerRoom`: a
  new `NotificationRoom` Durable Object (one instance per user, `wrangler.jsonc` migration `v5`),
  its own `notifications` table (migration `0042`), `lib/notifications.ts` (`notifyUser`/
  `notifyMentions` — fail-closed: a mention only reaches someone still a workspace member right
  now), and `routes/notifications.ts` (`GET` list + unread count, mark-one/mark-all read, and its
  own `/ws` upgrade). Client side: `NotificationBell.tsx` next to the Assistant launcher, polling
  every 60s (paused while the tab is hidden) with `useNotificationSocket` as a live-push backstop —
  two independent delivery paths on purpose, so a socket bug never means a lost notification.
- **Quick-add gets a due date and an assignee**, inline, without opening the panel — reuses the
  same `Calendar`/`Popover` and `MultiSelect` pattern already proven on `TaskCard`/`TaskRow`. The
  Board's own "+ Add a task" card (`stacked`) got a real redesign to go with it: a white
  (`bg-popover`) bordered card, each field — name, project, due date, assignee — on its own row
  with an icon and label, instead of icons crammed onto the name's input line. The List/subtask
  quick-add keeps the original compact one-line form, where that density is still the point.
- **Task description is rich text with a markable checklist** (tiptap — `@tiptap/react` +
  `starter-kit` + `extension-task-list`/`extension-task-item`, headless and styled to this app's
  own tokens in `index.css` `.tt-richtext`, not tiptap's default look). Bold, a heading level,
  bullet lists, and a checklist; autosaves on blur like every other field. `parseDescription`/
  `serializeDescription` (`lib/richText.ts`) read a **legacy plain-text description as-is** and
  wrap it as a single paragraph — no migration, no data loss for anything written before this
  shipped. `descriptionToPlainText` feeds the existing clamped one-line preview on the board card
  and the list row, unchanged.
### Fixed
- The board's status-column tint (`tt-swatch-column`) now rounds all four corners instead of only
  the top, and the "Add a task" row moved *inside* the tinted card, right after the last one — it
  used to sit outside, in plain grey, floating at the column's full height below a short list.

Verified: `pnpm check` exit 0, `pnpm lint` 0 errors. `task-board` + `task-detail-panel` +
`task-planning` + `task-statuses-fork` + new `task-comments.spec.ts` (4 tests: post/edit/delete
through the panel, cross-member authorization, live @mention → bell delivery, fail-closed on a
non-member id) all green, including 3 new `task-planning` cases for the rich-text description
(bold + round-trip, legacy plain-text back-compat, checklist toggle) and the quick-add pickers.

## 2026-09-17
### Added
- **Per-project status override on top of the workspace's global default** (`task_statuses.project_id`,
  migration `0041`). A project reads the global 5 columns until someone customizes its board —
  renames, recolors, recategorizes, reorders, archives, or adds a column while that project is
  selected — at which point `ensureProjectFork` clones the global set into rows scoped to that
  project (idempotent) and every edit lands on the fork instead, leaving the global set and every
  other project untouched. The fork is invisible to the UI: `StatusColumnMenu`/`AddStatusColumn`
  call the same mutations as always; `useUpdateTaskStatus`/`useArchiveTaskStatus`
  (`hooks/useTaskStatuses.ts`) detect a global row is being edited under a project scope and
  fork-then-redirect before issuing the write. A new status with no color chosen gets the next one
  not already in its set (`nextUnusedColor`, the same rule a new project or tag gets) — `color` is
  now optional on `CreateTaskStatusSchema`. The unfiltered "All tasks" board still shows the global
  columns; a task whose own status belongs to a project fork not on screen buckets into the nearest
  column of the same category instead of vanishing (`TaskBoard.tsx` `serverColumns`).
- **Board gets List's own filters**: Status (All/Active/Done) and Sort now show in both layouts;
  Group (Project/Due date/None — Status is List-only, since the Board's columns already are that
  grouping) now also renders on the Board, sub-grouping each column's cards under a small header
  (`clusterTasks`, `taskUtils.ts`) — tracked as its own `boardGroupBy` state, defaulting to `none`
  so the Board doesn't gain a default grouping on top of its columns that wasn't there before.
- **Status color derived from a formula, not five hardcoded hex values.** `.tt-swatch-column`
  (`index.css`), a weaker sibling of the existing `.tt-swatch-tint` chip formula, tints a column's
  background and a card's status pill from the status's own color via `color-mix(in oklab, ...)` —
  6% light / 10% dark, tuned against the reference hexes Luis gave. A column only wears its color
  once it holds a task (`tasks.length > 0`), matching the ClickUp reference instead of tinting five
  empty columns permanently. The tint (and the "Add a task" row) now hugs the actual card content
  height instead of stretching to the column's full flex height or pinning to its bottom edge.
- **Inline editing on the Board card** (`TaskCard.tsx`): status (reusing `TaskStatusChip`, now a
  tinted pill on both Board and List), priority, and due date are all clickable directly on the
  card — previously the only way to change status on the Board was dragging to another column, and
  priority/due date needed the detail panel.
- **A "…" menu on the Tasks page's project rail** (`TaskProjectRail.tsx`): Edit/Archive on each
  project row and each client heading, reusing `ProjectForm`/`ClientForm` and the same
  `DropdownMenu` + `MoreHorizontal` pattern `ProjectList.tsx`/`ClientList.tsx` already use, gated by
  `canManage`. Timer/Calendar's own project picker is untouched — scoped to `/tasks` only.
- Board's empty-column placeholder ("Drop a task here") is gone — the droppable region already
  covers the whole column, so it did nothing functional; only "+ Add a task" remains, matching the
  ClickUp reference.
- The `DragOverlay` ghost card that follows the cursor while dragging is now pinned to the real
  card's width (`w-[272px]`) — it rendered in a portal outside the column, so without an explicit
  width it sized to its own content and looked oversized.
### Fixed
- **A brand-new signup's very first session never got a workspace attached**
  (`session.activeOrganizationId` stayed `undefined`), so anything reading it — the D6 assignee
  picker (`getFullOrganization`) — showed zero members until the user logged in again. Root cause:
  the workspace is created in `databaseHooks.user.create.after`, but Better Auth's own
  `createOrganization` only marks the new org active `if (ctx.context.session)` — never true for
  that pre-session caller — and the session is minted before `user.create.after`'s effects are
  guaranteed visible to it, so even backfilling `user.last_active_organization_id` there (which
  `organizationHooks.afterCreateOrganization` now also does, for every *later* session) can't win
  that race for the first one. The real fix is `useWorkspaceMembers` (`useWorkspaceRole.ts`) no
  longer trusting `session.activeOrganizationId` at all — it resolves the workspace via `/api/me`
  instead, which every other endpoint already does through `resolveWorkspace`'s own per-request
  logic, so it's never stale.
- The already-uncommitted `optimisticAssignees` fix for "assignee picker needs closing the panel
  to see it stick" is confirmed working end-to-end (it was blocked on the bug above during
  verification) — see the new e2e coverage below.

Verified: `pnpm check` exit 0, `pnpm lint` 0 errors. `task-board` + `task-detail-panel` +
`task-planning` + `task-log-time` 28/28, plus new `task-statuses-fork.spec.ts` (3 tests: fork
isolation, auto-color, and the UI-driven rename-forks-transparently path) and a new
`task-detail-panel` test driving the assignee `MultiSelect` picker itself rather than the API, both
green. Manually verified the fork/color/isolation behavior against the running dev server with
curl before writing the e2e tests.

## 2026-09-16 (4)
### Added
- **D5 — task detail panel.** Clicking a task on the board or in the list now opens a right-side
  `TaskSheet` instead of the create dialog: every field (name, description, status, priority, due
  date, assignees, attachments, subtasks, tracked time) autosaves on change/blur, no batched "Save
  changes". Description limit raised 5,000 → 20,000 chars (plain text). Route `/tasks/:id` opens
  the panel directly and is shareable; closing it navigates back to `/tasks`. Full-screen on
  mobile, capped width from `sm` up.
- **D6 — one or more assignees per task**, chosen from the workspace's own members
  (`task_assignees` table, migration `0039`). Avatars on the board card and the list row, an
  Assignees field in both the create dialog and the detail panel, and an "Assigned to me" toggle
  on the Tasks header (board and list alike).
- **D7 — image attachments on a task**, stored in R2 (`ATTACHMENTS` binding, key
  `workspaceId/YYYY/MM/uuid`, migration `0040`). Attach by button, drag-and-drop or paste; PNG/JPEG/
  WebP resized (long edge capped at 2000px) and re-encoded to webp with `@cf-wasm/photon` — a WASM
  library that runs inside the Worker itself, so no paid Cloudflare Images product and no native
  `sharp` (which can't run in a Worker isolate at all). GIF passes through untouched to keep its
  animation. 10 MB max per file, type sniffed from content. Download is workspace-scoped
  (`GET /api/attachments/:id`); deleting a task or an attachment removes the R2 object too.

Verified: `pnpm check` exit 0, `pnpm lint` 0 errors, `task-board` + `task-planning` +
`task-log-time` + the new `task-detail-panel` 24/24 (serial run — task-board's two owner/member
tests are known-flaky in parallel, per the Network-connection-lost errors already documented for
this dev setup, not a regression). One old test (`task-planning`'s "editable through the task
dialog") was rewritten for the new panel; no other spec referenced the retired "Edit task" dialog.

## 2026-09-16 (3)
### Added
- **Dragging empty board background pans it sideways**, instead of the browser starting a text
  selection — `usePanScroll` (`hooks/usePanScroll.ts`), a callback-ref hook wired with plain
  `addEventListener` outside React's render cycle, since the React Compiler's ref-safety check
  refuses to let a `{ ref, onPointerDown }` pair through render otherwise. Skips anything already
  interactive (a card, a button) so it never competes with a card's own drag.

Verified: `pnpm check` exit 0, `pnpm lint` 0 errors, `task-board` + `task-planning` +
`task-log-time` 20/20, plus a manual check that panning moves `scrollLeft` by the dragged distance
and that dragging from a card still drags the card.

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
