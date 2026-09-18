// Workers AI streams each chunk twice over: legacy `response`/`tool_calls` AND OpenAI-style `choices[0].delta`.
// workers-ai-provider (3.3.1 and 4.0.0) emits both, doubling text and corrupting tool-call arguments; see docs/IA.md.

/** Drops the legacy duplicates from one SSE `data:` payload when the OpenAI-style `choices` carry the same content. */
export function dedupeStreamEvent(payload: string): string {
  if (payload === "[DONE]") return payload;
  let chunk: Record<string, unknown>;
  try {
    chunk = JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return payload;
  }
  if (!Array.isArray(chunk.choices) || chunk.choices.length === 0) return payload;
  delete chunk.response;
  delete chunk.tool_calls;
  return JSON.stringify(chunk);
}

/** Line-buffered SSE rewrite: chunk boundaries from the network never split a `data:` line in two. */
export function dedupeSseStream(stream: ReadableStream<BufferSource>): ReadableStream<Uint8Array> {
  let buffer = "";
  const rewrite = (line: string) =>
    line.startsWith("data:") ? `data: ${dedupeStreamEvent(line.slice(5).trim())}` : line;
  return stream
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(
      new TransformStream<string, string>({
        transform(text, controller) {
          buffer += text;
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) controller.enqueue(`${rewrite(line)}\n`);
        },
        flush(controller) {
          if (buffer) controller.enqueue(rewrite(buffer));
        },
      })
    )
    .pipeThrough(new TextEncoderStream());
}

/** The AI binding with streamed runs cleaned by dedupeSseStream; non-streamed runs pass through untouched. */
export function withDedupedStreams(ai: Ai): Ai {
  return new Proxy(ai, {
    get(target, prop, receiver) {
      if (prop !== "run") return Reflect.get(target, prop, receiver);
      return async (...args: Parameters<Ai["run"]>) => {
        const result: unknown = await target.run(...args);
        return result instanceof ReadableStream ? dedupeSseStream(result as ReadableStream<BufferSource>) : result;
      };
    },
  });
}
