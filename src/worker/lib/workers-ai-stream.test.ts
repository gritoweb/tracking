import { describe, expect, it } from "vitest";
import { dedupeSseStream, dedupeStreamEvent } from "./workers-ai-stream";

const textChunk = JSON.stringify({
  choices: [{ delta: { content: "Hello" }, index: 0 }],
  response: "Hello",
  tool_calls: [],
});
const toolChunk = JSON.stringify({
  choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "202" } }] }, index: 0 }],
  tool_calls: [{ arguments: 202 }],
});

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  return new Response(stream).text();
}

describe("dedupeStreamEvent", () => {
  it("drops the legacy text and tool-call copies when choices carry them", () => {
    expect(JSON.parse(dedupeStreamEvent(textChunk))).toEqual({
      choices: [{ delta: { content: "Hello" }, index: 0 }],
    });
    expect(JSON.parse(dedupeStreamEvent(toolChunk))).not.toHaveProperty("tool_calls");
  });

  it("keeps a legacy-only chunk, the done marker and non-JSON as they are", () => {
    const legacy = JSON.stringify({ response: "Hi" });
    expect(dedupeStreamEvent(legacy)).toBe(legacy);
    expect(dedupeStreamEvent("[DONE]")).toBe("[DONE]");
    expect(dedupeStreamEvent("not json")).toBe("not json");
  });
});

describe("dedupeSseStream", () => {
  it("rewrites data lines even when a network chunk splits one in the middle", async () => {
    const sse = `data: ${textChunk}\n\ndata: [DONE]\n\n`;
    const cut = 17;
    const encoder = new TextEncoder();
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(sse.slice(0, cut)));
        controller.enqueue(encoder.encode(sse.slice(cut)));
        controller.close();
      },
    });
    const out = await readAll(dedupeSseStream(source));
    expect(out).toBe(`data: ${JSON.stringify({ choices: [{ delta: { content: "Hello" }, index: 0 }] })}\n\ndata: [DONE]\n\n`);
  });
});
