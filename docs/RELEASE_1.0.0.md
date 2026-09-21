# TimeTracker 1.0.0 — release notes

Prepared on 2026-09-21 on the `refactor` branch. **Nothing here is deployed and nothing is merged into `master`**; the last section is the order to do that in. Every change below has a dated entry with its proof in [`CHANGELOG.md`](../CHANGELOG.md) (2026-09-18 entries 32 to 55).

## For the people using it

- **Comments on tasks grew up.** Type `@` and the list opens beside the `@` (it used to open under the whole box); two people with the same name show their e-mail so you can tell them apart. Editing a comment now looks like writing one. Owners and admins can delete any comment, authors their own. A task shows its newest 100 comments with **Load earlier comments** above them, and its card on the board shows how many it has.
- **Images on a task** can be added with an **Attach image** button, by dropping files on the area, or by pasting; several at once.
- **The task panel keeps up.** If a teammate renames the task or changes its estimate while you have it open, you see it, unless you are typing in that field.
- **Mention chips show the person's current name** in a description, not the name they had when they were tagged.
- **New workspaces and old ones share the same seven statuses:** Backlog, On hold, Pendente, Em progresso, QA, Client review, Closed.

## Data integrity

- **The database refuses hours without a project** (migration `0049`). A project that still has hours can no longer be deleted; it is archived, as the app always did.
- **A person is a member of a workspace once** (migration `0050`).

## Security

- **`/mcp` is gated before it reads the database**: a browser `Origin` that is not ours gets 403, and more than 600 requests a minute (10 a second) from one address get 429.
- **Request limits are shared across isolates** (sign-in, AI and `/mcp`) using Workers Rate Limiting bindings. Approximate by design: they slow abuse, they do not count exactly.
- **Integration URLs:** an IPv4 address hidden inside an IPv6 literal (including the cloud metadata address) is refused, and pushes to Workfront and Dynamics no longer follow redirects.
- **CORS** no longer answers `*` to a request without an `Origin`; attachment downloads carry an explicit `Content-Disposition`; the calendar OAuth state cookie is `__Host-` prefixed over https.
- `pnpm audit` is clean and no key or secret shape is in the git history.

## Under the hood

- ~800 tests. Route tests run against a real in-memory SQLite with every migration applied, so they check the real SQL and the real permission rules; the coverage floor rose from 28% to 44% lines (routes now count).
- The stylesheet is split by subject (`src/react-app/css/`) with identical output; four patterns pasted across screens are now named (`Button ghost-destructive`, `Input bare`, `CenteredPage`, `ReportFigure`, `SettingsHint`); a lint rule catches handlers that swallow errors by returning `undefined`, `null` or `[]`.

## Known limits

- A public hostname that resolves to a private address still passes the integration URL guard (a Worker cannot resolve names); only owners and admins can set an integration URL.
- A repeated name in a task **title** resolves to the first person with that name (titles are plain text); tag them in a comment for an exact tag.
- The browser extension and the MCP tool catalog were not part of this release (see `ROADMAP.md`).
- Cloudflare's rate limit binding can only be seen enforcing after a deploy; in the local production-mode runtime the `/mcp` gate answered 401 up to the configured limit for one address and 429 beyond it.

## Deploying it (in this order; each step needs a person's go-ahead)

1. Back up the remote database: `npx wrangler d1 export time-tracker --remote --output <file>.sql`.
2. Check membership has no duplicates before `0050`: `SELECT COUNT(*), COUNT(DISTINCT organizationId || '/' || userId) FROM "member"` must return the same number twice (it did on 2026-09-21).
3. Check no time entry lacks a project if you want `0049` to also cover old rows (it only guards new writes and updates of `project_id`).
4. Apply the migrations: `npx wrangler d1 migrations apply time-tracker --remote` (`0049`, `0050`).
5. Confirm the three `ratelimits` `namespace_id`s in `wrangler.jsonc` (540101, 540102, 540103) are unused in the Cloudflare account.
6. Merge `refactor` into `master` and push; Workers Builds deploys it (its Build command must be `pnpm build`, see `CLAUDE.md`).
7. Smoke test: `curl -s -o /dev/null -w "%{http_code}" https://tracking.gritoweb.com.br/` is `200`; sign in; open a task, post and edit a comment, attach an image; `curl -i -X POST .../mcp` answers 401 with `WWW-Authenticate`, and with `-H "Origin: https://example.com"` answers 403.
8. Tag `v1.0.0` on the merge commit.
