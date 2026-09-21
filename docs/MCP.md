# MCP connector

Connect Claude, ChatGPT, or any other MCP client to a workspace and ask about
your time in plain language — then act on it.

> *"Which clients were most profitable per hour last quarter?"*
> *"Is the Meridian project going to blow its budget?"*
> *"What did I actually work on last Thursday?"*
> *"Log two hours on the Acme redesign this morning."*

The server speaks **Streamable HTTP** at `https://tracking.gritoweb.com.br/mcp` and
authenticates with a workspace **API key**. It is stateless — no session, no
Durable Object — so a client can reconnect at any time without losing anything.

---

## 1. Create an API key

**Settings → Workspace → MCP connector → Create key.**

| Scope | What the assistant can do |
|---|---|
| **Read only** | Projects, clients, entries, summaries, budgets, the running timer, drafts |
| **Read + write** | All of the above, plus log entries, edit or delete them, and draft a day |

The key is shown **once** and cannot be recovered — only its SHA-256 is stored.
If you lose it, revoke it and make another. Revocation takes effect on the very
next request.

Prefer **read only** unless you actually want the assistant writing to your
timesheet. You can hold several keys at once (one per client), which makes it
easy to revoke just the one that leaked.

## 2. Connect a client

### Claude Code

One command — it speaks HTTP with a bearer header natively:

```bash
claude mcp add --transport http timetracker https://tracking.gritoweb.com.br/mcp \
  --header "Authorization: Bearer tt_live_…"
```

### Claude Desktop

Claude Desktop's built-in custom-connector flow expects OAuth, which this server
does not implement, so bridge it with `mcp-remote`. Edit
`~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "timetracker": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://tracking.gritoweb.com.br/mcp",
               "--header", "Authorization:${TT_AUTH}"],
      "env": { "TT_AUTH": "Bearer tt_live_…" }
    }
  }
}
```

Two details that are easy to get wrong and both fail confusingly:

- **No space after `Authorization:`.** Claude Desktop splits arguments on
  whitespace, which would sever the header from its value. The `${TT_AUTH}`
  indirection is what keeps the value in one piece.
- **The key goes in `env`, not `args`.** Anything that can run `ps` can read a
  process's argv.

Then **quit Claude Desktop completely (⌘Q) and reopen it** — the config is read
at launch, and `serverInfo` is cached from the connection made then. A running
instance will not pick up a new key, or a new server name, until it reconnects.

### ChatGPT and other clients

Anything that supports **remote MCP over Streamable HTTP with a custom header**
works. Point it at `https://tracking.gritoweb.com.br/mcp` and send:

```
Authorization: Bearer tt_live_…
```

There is no OAuth flow. A client that only offers OAuth (rather than a header or
a bearer token field) needs `mcp-remote` in front of it, as above.

## 3. Check it works

```bash
KEY=tt_live_…
curl -s -X POST https://tracking.gritoweb.com.br/mcp \
  -H "Authorization: Bearer $KEY" \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{
        "protocolVersion":"2025-06-18","capabilities":{},
        "clientInfo":{"name":"curl","version":"1"}}}'
```

A healthy server answers with an SSE frame containing:

```json
{"serverInfo":{"name":"timetracker","title":"TimeTracker","version":"1.1.0",
               "websiteUrl":"https://tracking.gritoweb.com.br","icons":[…]}}
```

Swap `"method":"tools/list"` (and drop `params`) to see the tools your key can
reach — 25 on a read key, 64 on read+write (25 read + 39 write).

---

## Tools

| Group | Read (any key) | Write (read+write key only) |
|---|---|---|
| Time | `get_running_timer`, `list_time_entries`, `get_time_entry`, `get_time_summary`, `run_report`, `list_drafts` | `log_time`, `update_time_entry`, `delete_time_entry`, `copy_week`, `draft_day` |
| Catalog | `list_projects`, `list_clients`, `list_tags`, `get_project_pacing` | `create_project`, `update_project`, `archive_project`, `create_client`, `update_client`, `archive_client`, `create_tag`, `update_tag`, `delete_tag` |
| Tasks | `list_tasks`, `get_task`, `list_task_statuses`, `list_task_comments`, `list_task_attachments` | `create_task`, `update_task`, `move_task`, `delete_task`, `create_task_status`, `update_task_status`, `archive_task_status`, `add_task_comment`, `edit_task_comment`, `delete_task_comment`, `upload_task_attachment`, `delete_task_attachment` |
| Productivity | `list_favorites`, `list_recurring`, `list_saved_reports`, `get_planner` | `create_favorite`, `delete_favorite`, `create_recurring`, `update_recurring`, `delete_recurring`, `create_saved_report`, `delete_saved_report`, `set_planner_hours` |
| Account | `whoami`, `list_members`, `list_api_keys`, `list_notifications`, `get_settings`, `get_calendar_status` | `mark_notification_read`, `mark_all_notifications_read`, `delete_notification`, `update_settings`, `set_calendar_auto_track` |

`list_task_comments` returns a task's newest 100 comments, oldest first. Pass `limit` (1–200) for a different page size and `before` (a comment id) to read the ones older than it.

25 read tools + 39 write tools = 64 total. `start_timer`, `stop_timer` and
`start_favorite` were removed on purpose (decision 2026-09-18): timers are
app-only, and logging/editing entries already covers what the AI needs to do.
`get_running_timer` stays — reading the timer is still useful, starting or
stopping it from a chat isn't.

Every tool obeys the app's permissions for the key's owner: most run through
`src/worker/mcp/rest-bridge.ts`, which calls the app's own routers (the same
ones the screens use), so a member's key gets the same 403 the app would show,
and a chat answer can't disagree with the Reports page. Members and API keys are
read-only here; inviting, removing and key management stay in the app. Refusals
come back with `isError: true` and a next step (`refuse()` in
`src/worker/mcp/shared.ts`); results are compacted to drop UI-only keys like
`workspaceId` (`compact()`); every input field carries a description
(`FIELD_DOCS`). Coverage checklist: `docs/MCP_INTEGRATIONS.md`.

## Same tools in the in-app Assistant

`src/worker/mcp/registry.ts` (`registerAllTools`) is the one catalog: both the
MCP server (`mcp/server.ts`) and the in-app Assistant's chat
(`mcp/chat-tools.ts` → `buildChatTools`, used by
`src/worker/durable-objects/ChatAgent.ts`) register from it, so a tool added
here reaches the chat with no porting. In the chat every non-read-only tool
needs the person's approval before it runs (AI SDK `needsApproval`) — the same
"ask, don't assume" posture as the refusals below. The Assistant keeps 3
chat-only tools that aren't part of the MCP catalog, in
`src/worker/lib/assistant-tools.ts`: `trackMeeting`, `rememberPreference` and
`searchMemory`.

Each tool declares `readOnlyHint` / `destructiveHint` / `idempotentHint` /
`openWorldHint`, so a client can badge them and stop prompting for harmless
reads. `openWorldHint` is `false` throughout: every tool touches this one
workspace's own database and nothing on the open internet.

Write tools are **registered only for a read+write key**. A read-only key isn't
shown them at all, rather than being refused when it calls one.

## What the model is told

The server sends `instructions` on connect, which clients prepend to the model's
context. They cover the things a tool schema can't say:

- **Pass `timezoneOffsetMinutes`.** Date ranges are the *user's* local days. If a
  client omits it, the range silently means UTC days — which, west of UTC,
  quietly includes the previous evening and drops part of the user's own day.
  This is advisory: if a "yesterday" answer looks shifted by a few hours, this is
  the first thing to suspect.
- Look project ids up with `list_projects` rather than guessing them.
- **Ask, don't assume.** Every entry needs a project and every project a client.
  When the person didn't say which, the model is told to ask and wait — never to
  pick one, and never to create a project or client to get past a refusal. The
  refusals say so too, so a model that ignores the instructions still can't
  quietly choose for someone.
- A project listed with `needsClient: true` predates that rule and takes no time
  until a person links its client in the app (the project picker offers it).
- `get_time_summary` for "how much", `list_time_entries` for "what".
- A project with no rate contributes 0 to any amount — that's "no rate set",
  never "earned nothing".
- Drafted entries are **proposals, not tracked time**. They appear in no report
  and no total until a person confirms them in the app; `draft_day` creates them,
  it does not log time.

## Troubleshooting

**`401` on every request.** The key is wrong, revoked, or the header is
malformed. The response includes `WWW-Authenticate: Bearer realm="timetracker"`.
Note the server deliberately rejects a Better Auth *session* token here — only
`tt_live_…` keys are accepted, so a caller who thinks they're presenting an API
key is told when they aren't.

**Claude Desktop shows the connector but no tools**, or fails at launch with
`Cannot find module './lib/dispatcher/client'`. That's a corrupt `undici` in the
npx cache, not this server. Clear the offending entry and relaunch:

```bash
rm -rf ~/.npm/_npx/*    # or just the hashed dir named in the error
```

**The connector still shows an old name or icon.** `serverInfo` is cached from
the connection made at launch. Quit the client fully and reopen.

**Answers are a few hours out on "yesterday" / "last week".** The client is
probably not passing `timezoneOffsetMinutes`. See above.

**`403 Forbidden origin`.** The request carried a browser `Origin` header that
isn't this app's. MCP clients are programs and send none; a browser page on
another site must not be able to drive the server (DNS rebinding), so it is
refused before anything else. Call it from the client, not from a web page.

**`429 Too many requests`** with a `Retry-After`. `/mcp` allows about 600 (ten a second)
requests a minute per address, checked before the key is looked up. A client
that pages through a large workspace should batch its calls and honour
`Retry-After`; the limit is per location and approximate, so a brief burst over
it can pass and a sustained one cannot.

**A tool the docs list isn't there.** You're on a read-only key; the 39 write
tools are only registered for read+write. If it's `start_timer`, `stop_timer`
or `start_favorite`, it's not a key issue — those were removed (see Tools
above).

## Security model

- Only the **SHA-256** of a key is stored. The plaintext is returned once, at
  creation, and is unrecoverable — a key list that could reveal its own secrets
  would be one database read from a breach.
- **Workspace membership is re-verified on every call**, not just at creation. A
  key outlives the browser session that minted it, so "the person who made this
  was removed from the workspace six months ago" is the case that matters.
- **No tool takes a workspace id.** It is fixed at construction from the resolved
  key, so nothing a model can invent reaches a tenant boundary.
- **Key management is session-only** and unreachable from `/mcp`. A credential
  that could mint further credentials would turn one leaked key into permanent
  access.
- Revocation is immediate — the next request 401s.
- **Checked before the database.** A browser `Origin` that isn't ours is refused
  with 403 and a per-address limit answers 429, both before the key is looked up,
  so guessing keys or flooding the endpoint costs no query.
- **A key acts as the person who created it**, with that person's role: a
  member's key has a member's permissions and stops working when they leave the
  workspace. Any member may create or revoke a workspace key; that is a product
  decision (keys belong to the workspace), not an oversight.

## Implementation map

| Concern | Where |
|---|---|
| Tool definitions, by subject | `src/worker/mcp/tools/*.ts` |
| The one catalog (MCP + chat share it) | `src/worker/mcp/registry.ts` |
| `serverInfo`, `instructions`, MCP server build | `src/worker/mcp/server.ts` |
| Chat's version of the catalog | `src/worker/mcp/chat-tools.ts` |
| Key creation, hashing, resolution | `src/worker/lib/api-keys.ts` |
| Key management API (session-only) | `src/worker/routes/api-keys.ts` |
| `/mcp` request gate | `handleMcpRequest` in `src/worker/index.ts` |
| Settings card | `src/react-app/components/settings/McpConnectorCard.tsx` |
| Tests | `e2e/mcp.spec.ts` |

Transport is `agents/mcp`'s `createMcpHandler` — Streamable HTTP, stateless. A
fresh `McpServer` is built per request, bound to the workspace the key resolved
to. See `docs/ARCHITECTURE.md` for how it sits in the request lifecycle.
