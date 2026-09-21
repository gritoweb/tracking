// The assistant's chat brain: one AIChatAgent (Durable Object) per workspace member. Persists
// the conversation + resumable streams in its own SQLite, and on each turn runs
// a Workers AI (Llama) streamText loop with the assistant tools bound. The DO's
// instance name IS "<workspaceId>:<userId>" — the worker rewrites /agents/* routing so a
// client can only ever reach its own agent (see worker/index.ts).

import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type StreamTextOnFinishCallback,
  type ToolSet,
  type UIMessage,
} from "ai";
import { createWorkersAI } from "workers-ai-provider";
import { buildAssistantContext } from "../lib/assistant";
import { buildAssistantTools } from "../lib/assistant-tools";
import { buildChatTools } from "../mcp/chat-tools";
import { replyLanguage, settleDanglingToolCalls, restoreApprovalSignatures } from "../lib/assistant-messages";
import { recallMemories, buildMemoryBlock } from "../lib/assistant-memory";
import { withDedupedStreams } from "../lib/workers-ai-stream";
import { isoOffset } from "../lib/local-date";
import { buildAssistantSystemPrompt } from "../lib/assistant-prompt";

// Function calling over the 64-tool catalog; Scout picked the wrong tool most of the time (docs/IA.md).
const MODEL = "@cf/zai-org/glm-4.7-flash";

// Cost/abuse bounds (this DO is billed per Workers AI call):
// cap a single reply's length, the size of any one inbound message fed to the
// model, and how many turns a person can fire per minute.
const MAX_OUTPUT_TOKENS = 800;
const MAX_MESSAGE_CHARS = 4000;
const RATE_LIMIT_MAX = 15;
const RATE_LIMIT_WINDOW_MS = 60_000;

// Typed against Cloudflare.Env (the SDK's generic constraint). Our app-level
// `Env` marks a few secrets optional, which isn't assignable to that constraint;
// Cloudflare.Env is a structural superset our Env-typed helpers still accept.
export class ChatAgent extends AIChatAgent<Cloudflare.Env> {
  // Bound so a long-lived agent doesn't grow unbounded in SQLite.
  maxPersistedMessages = 100;

  // Per-instance (== per-person) sliding-window rate limiter. In-memory, so it
  // resets if the DO hibernates — enough to stop a runaway client from spamming
  // Workers AI calls, same trade-off as the REST rate-limit middleware.
  private recentTurns: number[] = [];

  // Work around agents@0.17.4 dropping the signature it itself issues when a
  // tool-approval-request is first persisted — see restoreApprovalSignatures.
  // In-memory: resets on hibernation, same accepted trade-off as recentTurns above.
  private pendingApprovalSignatures = new Map<string, string>();

  async onChatMessage(onFinish: StreamTextOnFinishCallback<ToolSet>, options?: OnChatMessageOptions) {
    const [workspaceId, userId] = this.name.split(":");
    // The /agents gate always pins both; an instance without a person never reaches a tool.
    if (!workspaceId || !userId) {
      return this.textResponse("Reload the app to reconnect the Assistant.");
    }

    const now = Date.now();
    this.recentTurns = this.recentTurns.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (this.recentTurns.length >= RATE_LIMIT_MAX) {
      return this.textResponse(
        "You're sending messages faster than I can keep up — give me a few seconds and try again.",
      );
    }
    this.recentTurns.push(now);
    // Client sends its getTimezoneOffset() per request so grounded times read in
    // the user's local zone; 0 (UTC) if absent.
    const rawOffset = Number(options?.body?.timezoneOffsetMinutes);
    const offset = Number.isFinite(rawOffset) ? Math.max(-14 * 60, Math.min(14 * 60, rawOffset)) : 0;

    const [context, memories] = await Promise.all([
      buildAssistantContext(this.env, workspaceId, userId, offset),
      recallMemories(this.env.DB, workspaceId, userId),
    ]);
    const memoryBlock = buildMemoryBlock(memories);

    const language = replyLanguage(this.messages);
    const offsetLabel = isoOffset(offset);
    const system = buildAssistantSystemPrompt({ offset, offsetLabel, memoryBlock, context, language });

    const workersai = createWorkersAI({ binding: withDedupedStreams(this.env.AI) });
    // Tools read `waitUntil` off an ExecutionContext; a Durable Object offers the same through its state.
    const executionCtx = {
      waitUntil: (promise: Promise<unknown>) => this.ctx.waitUntil(promise),
      passThroughOnException: () => {},
      props: {},
    } as unknown as ExecutionContext;
    const tools = {
      ...buildChatTools({ env: this.env, workspaceId, userId, scope: "read_write", executionCtx }),
      ...buildAssistantTools({ env: this.env, workspaceId, userId, offsetMinutes: offset, executionCtx }),
    };

    // Clamp any oversized message before it reaches the model, so a single huge
    // paste can't inflate the prompt (and cost/CPU) unbounded.
    const restored = restoreApprovalSignatures(this.messages, this.pendingApprovalSignatures);
    const bounded = settleDanglingToolCalls(restored).map((m) => ({
      ...m,
      parts: m.parts.map((p) =>
        p.type === "text" && p.text.length > MAX_MESSAGE_CHARS
          ? { ...p, text: p.text.slice(0, MAX_MESSAGE_CHARS) }
          : p,
      ),
    })) as UIMessage[];

    const result = streamText({
      model: workersai(MODEL),
      system,
      messages: await convertToModelMessages(bounded),
      tools,
      // Enforces needsApproval server-side instead of trusting the client — SECURITY.md S-02.
      experimental_toolApprovalSecret: this.env.AUTH_SECRET,
      stopWhen: stepCountIs(5),
      // Scout answers in the language of the last thing it read, usually an English tool result; restate the reply language last.
      prepareStep: ({ messages }) => ({ messages: [...messages, { role: "system" as const, content: language }] }),
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      abortSignal: options?.abortSignal,
      onFinish,
    });

    // Tap the stream for the signature agents@0.17.4 won't persist itself — see
    // restoreApprovalSignatures. Every other chunk passes through untouched.
    const stream = result.toUIMessageStream().pipeThrough(
      new TransformStream({
        transform: (chunk, controller) => {
          if (chunk.type === "tool-approval-request" && chunk.signature) {
            this.pendingApprovalSignatures.set(chunk.toolCallId, chunk.signature);
          }
          controller.enqueue(chunk);
        },
      }),
    );
    return createUIMessageStreamResponse({ stream });
  }

  /** A one-off assistant text reply (rate-limit notice) without a model call. */
  private textResponse(text: string): Response {
    const stream = createUIMessageStream({
      execute: ({ writer }) => {
        const id = crypto.randomUUID();
        writer.write({ type: "text-start", id });
        writer.write({ type: "text-delta", id, delta: text });
        writer.write({ type: "text-end", id });
      },
    });
    return createUIMessageStreamResponse({ stream });
  }
}
