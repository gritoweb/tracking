# AI models (Workers AI)

Which model does what, why, and what was checked. **Decision (2026-09-18): keep the models that
already work.** The plan to unify everything on `@cf/meta/llama-3.1-8b-instruct` was dropped because
that model is no longer offered and its remaining variant cannot do what the app needs.

## What runs where

| Feature | Code | Model | Why this one |
|---|---|---|---|
| Assistant chat (the MCP tool catalog + track a meeting, remember, recall) | `src/worker/durable-objects/ChatAgent.ts` | `@cf/zai-org/glm-4.7-flash` | Needs **function calling**; picked the right tool 9/12 vs Scout's 5/12 (see below), at ~1/4.5 of Scout's input price |
| Quick-add, project recolor, calendar event → project, day-draft enrichment | `src/worker/lib/ai.ts` (`QUICK_ENTRY_MODEL`) | `@cf/meta/llama-4-scout-17b-16e-instruct` | Needs **`json_schema` response mode** |
| AI summary, digest narrative | `src/worker/lib/ai.ts` (`SUMMARY_MODEL`) | `@cf/meta/llama-3.1-8b-instruct-fp8` | Plain text only — the cheaper model is enough |

Every call goes through the `AI` binding (`wrangler.jsonc`, `"remote": true`) and the AI Gateway
`default`. Every AI feature has a deterministic fallback: a failed or invalid AI answer never blocks
the action.

## Assistant tools

The chat's tools are not its own — they come from the MCP catalog (`src/worker/mcp/registry.ts`,
see `docs/MCP.md`), so a tool added to MCP reaches the chat with no porting. Every write among them
needs the person's approval before it runs, the same as any other MCP write tool.

## Why not `llama-3.1-8b-instruct` for everything

Checked on 2026-09-18 with `npx wrangler ai models list --json`:

- `@cf/meta/llama-3.1-8b-instruct` **is not in the catalog any more** — only `-fp8` is.
- `@cf/meta/llama-3.1-8b-instruct-fp8` does **not** declare `function_calling`, so the Assistant could
  not start or stop a timer with it.
- The same `-fp8` model **lost `json_schema` mode** (error 5025, around July 2026), which is why
  `QUICK_ENTRY_MODEL` moved to Scout. Putting quick-add back on it would break quick-add, recolor and
  drafting.

Scout declares both `function_calling` and a 131k context window.

## Why the chat moved off Scout (2026-09-18)

Same system prompt, the real 64 tools, through `streamText` + `workers-ai-provider` (with the stream
dedupe), 4 prompts x 3 runs, first tool call scored:

| Model | Right first tool | Input $/M |
|---|---|---|
| `llama-4-scout-17b-16e-instruct` | 5/12 (e.g. "list my tasks" called `run_report` 5 of 6 times; some empty replies) | 0.27 |
| `gpt-oss-20b` | 7/12 (some misses were a fair clarifying question) | 0.20 |
| `glm-4.7-flash` | 9/12 | 0.0605 |

Caveats: 12 samples per model; glm was slower (~9.5 s per call vs ~1.3 s for Scout); not yet checked in
the app's own chat. Untested: qwen3-30b, gemma-4-26b, mistral-small-3.1, and Scout with a ~14-tool
subset (the cheaper lever if the model is kept). Quick-add, recolor and drafting stay on Scout for
`json_schema`.

## Cost

Workers AI bills in neurons: 10,000 free per day, then $0.011 per 1,000.

- Scout: $0.27 per million input tokens, $0.85 per million output tokens.
- 8B-fp8: $0.152 per million input tokens, $0.287 per million output tokens.

**Measured 2026-09-18** (Workers AI `usage`, one call to Scout with and without the tools): the 64
catalog tools add **~17,900 prompt tokens, ~440 neurons per model call**. A chat turn makes 1–3 model
calls (the tool call, then the answer), plus ~4k tokens of context — roughly **500–1,300 neurons per
turn**, so about 10–20 turns a day fit the free allocation and each turn beyond it costs about
US$0.005–0.015. Quick-add and the JSON calls are small (tens of neurons). If chat volume grows, the
levers are a cheaper function-calling model or sending the chat a smaller tool subset.

## If this needs to change later

Cheaper models that declare `function_calling` exist in the catalog
(`@cf/ibm-granite/granite-4.0-h-micro`, `@cf/qwen/qwen3-30b-a3b-fp8`, `@cf/openai/gpt-oss-20b`).
None has been tested with the Assistant's real prompts. Switching is a change to one constant, but it
needs that test first: the Assistant must call its tools correctly in English and Portuguese, and
quick-add must return valid JSON with correct local times.

## The streaming bug and its fix (2026-09-18)

Workers AI now streams every chunk **twice over**: the legacy fields (`response`, top-level
`tool_calls`) and the OpenAI-style `choices[0].delta` carry the same content. `workers-ai-provider`
(3.3.1, and 4.0.0 too — checked) emits both, so the Assistant doubled every word ("SinceSince today
today") and concatenated tool-call arguments into invalid JSON, which the AI SDK turned into an
empty input and "An error occurred". Proven with the raw stream (`/ai/run` with `stream: true`) and
with `streamText` against the real model: without the fix every tool call failed to parse; with it
the call arrived intact and the reply was clean in English and Portuguese.

The fix is `src/worker/lib/workers-ai-stream.ts`: `withDedupedStreams(env.AI)` wraps the binding the
chat uses and drops the legacy duplicates from each SSE event whenever `choices` is present. Only
streamed runs are touched. Remove it once the provider handles both shapes itself — re-run the
check in the CHANGELOG entry before removing it.

## Local development uses the real Workers AI

`"remote": true` on the binding means `pnpm dev` calls Cloudflare's Workers AI on the account in
`CLOUDFLARE_ACCOUNT_ID`, not a local model. Testing AI locally therefore spends that account's
neurons, and a working local AI call proves the binding and the gateway work for that account.
