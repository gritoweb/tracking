import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { replyLanguage, settleDanglingToolCalls } from "./assistant-messages";

const pending = {
  type: "tool-create_task",
  toolCallId: "call-1",
  state: "approval-requested",
  input: { name: "Review contract" },
  approval: { id: "approval-1" },
} as unknown as UIMessage["parts"][number];

const thread = (last: UIMessage): UIMessage[] => [
  { id: "u1", role: "user", parts: [{ type: "text", text: "create a task" }] },
  { id: "a1", role: "assistant", parts: [pending] },
  last,
];

describe("settleDanglingToolCalls", () => {
  it("denies an approval the user skipped by writing a new message", () => {
    const out = settleDanglingToolCalls(thread({ id: "u2", role: "user", parts: [{ type: "text", text: "what's due?" }] }));
    expect(out[1].parts[0]).toMatchObject({ state: "output-denied", approval: { id: "approval-1", approved: false } });
  });

  it("leaves the current turn alone, so an approval click still continues it", () => {
    const messages = thread({ id: "u2", role: "user", parts: [{ type: "text", text: "hi" }] }).slice(0, 2);
    expect(settleDanglingToolCalls(messages)[1].parts[0]).toMatchObject({ state: "approval-requested" });
  });

  it("marks an interrupted call as an error", () => {
    const cut = { ...pending, state: "input-available", approval: undefined } as unknown as UIMessage["parts"][number];
    const out = settleDanglingToolCalls([
      { id: "a0", role: "assistant", parts: [cut] },
      { id: "u2", role: "user", parts: [{ type: "text", text: "again" }] },
    ]);
    expect(out[0].parts[0]).toMatchObject({ state: "output-error" });
  });
});

describe("replyLanguage", () => {
  const ask = (text: string): UIMessage[] => [{ id: "u", role: "user", parts: [{ type: "text", text }] }];
  it("names Portuguese when the user wrote in Portuguese", () => {
    expect(replyLanguage(ask("o que tenho pra hoje?"))).toContain("pt-BR");
  });
  it("falls back to mirroring for other languages", () => {
    expect(replyLanguage(ask("what do I have today?"))).not.toContain("pt-BR");
  });
});
