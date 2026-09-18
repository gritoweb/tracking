import type { UIMessage } from "ai";

type Part = UIMessage["parts"][number];

const isToolPart = (part: Part): boolean => part.type.startsWith("tool-") || part.type === "dynamic-tool";

function settle(part: Part): Part {
  if (!isToolPart(part) || !("state" in part)) return part;
  const approvalId = "approval" in part && part.approval ? part.approval.id : crypto.randomUUID();
  if (part.state === "approval-requested") {
    return { ...part, state: "output-denied", approval: { id: approvalId, approved: false, reason: "The user moved on without approving." } } as Part;
  }
  if (part.state === "input-available" || part.state === "input-streaming") {
    return { ...part, state: "output-error", errorText: "Interrupted before it ran." } as Part;
  }
  return part;
}

/** Closes tool calls left open before the latest user message; one unanswered approval otherwise breaks every later turn. */
export function settleDanglingToolCalls(messages: UIMessage[]): UIMessage[] {
  const lastUser = messages.map((m) => m.role).lastIndexOf("user");
  return messages.map((m, i) => (i >= lastUser ? m : { ...m, parts: m.parts.map(settle) }));
}

const PORTUGUESE = /[ãõçâêô]|\b(que|não|nao|tenho|quantas?|quantos?|hoje|semana|crie|criar|mostre|lancei|minhas?|meus?|tarefas?|horas|projetos?|você|voce|pra|para|está|esta)\b/i;

/** The reply-language line for the prompt: Scout ignores "answer in the user's language" but follows a named one. */
export function replyLanguage(messages: UIMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const text = lastUser?.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ") ?? "";
  return PORTUGUESE.test(text)
    ? "The user wrote in Portuguese. Reply ONLY in Brazilian Portuguese (pt-BR), even though the tools and facts above are in English."
    : "Reply in the language of the user's last message.";
}
