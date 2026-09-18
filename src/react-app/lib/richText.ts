import type { JSONContent } from "@tiptap/react";

const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

/** A doc with no visible content — the editor's own default empty state. */
function isEmptyDoc(doc: JSONContent): boolean {
  if (!doc.content?.length) return true;
  return doc.content.every((node) => node.type === "paragraph" && !node.content?.length);
}

/** Old descriptions are plain text; anything already a tiptap doc is used as-is — no data lost either way. */
export function parseDescription(raw: string | null): JSONContent {
  if (!raw) return EMPTY_DOC;
  try {
    const parsed = JSON.parse(raw) as JSONContent;
    if (parsed?.type === "doc") return parsed;
  } catch {
    // Not JSON — a legacy plain-text description, wrapped below.
  }
  return { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: raw }] }] };
}

export function serializeDescription(doc: JSONContent): string | null {
  return isEmptyDoc(doc) ? null : JSON.stringify(doc);
}

/** For a clamped one-line preview (the board card) — text only, no marks/formatting. */
export function descriptionToPlainText(raw: string | null): string {
  if (!raw) return "";
  let doc: JSONContent;
  try {
    doc = JSON.parse(raw) as JSONContent;
    if (doc?.type !== "doc") return raw;
  } catch {
    return raw;
  }
  const parts: string[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === "text" && node.text) parts.push(node.text);
    if (node.type === "mention") parts.push(`@${String(node.attrs?.label ?? node.attrs?.id ?? "")}`);
    node.content?.forEach(walk);
  };
  walk(doc);
  return parts.join(" ").trim();
}
