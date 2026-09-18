// The MCP catalog as AI SDK tools for the in-app Assistant: a tool added to the MCP server reaches the chat with no porting.
import { tool, type ToolSet } from "ai";
import { z, type ZodRawShape } from "zod";
import { registerAllTools } from "./registry";
import type { McpContext, ToolRegistrar } from "./shared";

interface RecordedConfig {
  description?: string;
  inputSchema?: ZodRawShape;
  annotations?: { readOnlyHint?: boolean };
}

interface ToolResult {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

type Handler = (args: Record<string, unknown>) => Promise<ToolResult> | ToolResult;

/** What the chat model reads back: the tool's JSON (or text), or `{ ok: false, reason }` for a refusal. */
export function toChatResult(result: ToolResult): unknown {
  const text = result.content?.find((c) => c.type === "text")?.text ?? "";
  if (result.isError) return { ok: false, reason: text };
  try {
    return JSON.parse(text);
  } catch {
    return { ok: true, message: text };
  }
}

export function buildChatTools(ctx: McpContext): ToolSet {
  const recorded: Array<{ name: string; config: RecordedConfig; handler: Handler }> = [];
  const recorder = {
    registerTool: (name: string, config: RecordedConfig, handler: Handler) => {
      recorded.push({ name, config, handler });
    },
  } as unknown as ToolRegistrar;
  registerAllTools(recorder, ctx);

  return Object.fromEntries(
    recorded.map(({ name, config, handler }) => [
      name,
      tool({
        description: config.description ?? name,
        inputSchema: z.object(config.inputSchema ?? {}),
        // Every write waits for the person's click: text injected via a calendar or entry must not act unconfirmed.
        needsApproval: config.annotations?.readOnlyHint !== true,
        execute: async (args: Record<string, unknown>) => toChatResult(await handler(args)),
      }),
    ])
  );
}
