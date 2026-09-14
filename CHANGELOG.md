# Changelog

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
