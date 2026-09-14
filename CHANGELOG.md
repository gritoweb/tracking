# Changelog

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
  e `pnpm lint` limpos, deploy em produção (curl 200, Version ID `59c56177-7461-48b0-a303-613a21cb585d`).

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
  deploy em produção (curl 200, Version ID `e9b4cb53-9f44-4a62-8a65-6e7b1d3f1bf9`).
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
  produção (`curl` 200 em `tracking.gritoweb.com.br`, Version ID `e83fecf5-cd68-4678-8d59-aa0519e73e73`).
