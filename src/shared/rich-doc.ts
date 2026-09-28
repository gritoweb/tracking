/** The editor's stored document (tiptap JSON), shared by task descriptions and comments. */
export interface RichNode {
  type?: string;
  text?: string;
  attrs?: { id?: unknown; label?: unknown; [key: string]: unknown };
  content?: RichNode[];
}

// A hostile document must not grow the call stack; real ones nest a handful of levels.
const MAX_DEPTH = 100;

// Nodes that end a line when read as text; everything else runs inline.
const BLOCKS = new Set(["paragraph", "heading", "listItem", "taskItem", "codeBlock", "blockquote", "horizontalRule", "fileAttachment"]);

/** The editor node for a non-image file in a description or comment: a card that opens the attachment. */
export const FILE_ATTACHMENT_NODE = "fileAttachment";

/** The stored JSON doc, or null when the value is not one (legacy plain text, broken JSON). */
export function parseDoc(raw: string | null | undefined): RichNode | null {
  if (!raw || raw[0] !== "{") return null;
  try {
    const doc = JSON.parse(raw) as RichNode;
    return doc?.type === "doc" ? doc : null;
  } catch {
    return null;
  }
}

/** A document as text: one line per block, a mention written however the caller needs it. */
export function docToText(doc: RichNode, mention: (id: string, label: string) => string): string {
  const out: string[] = [];
  const visit = (node: RichNode, depth: number) => {
    if (!node || typeof node !== "object" || depth > MAX_DEPTH) return;
    if (node.type === "text") out.push(node.text ?? "");
    else if (node.type === "hardBreak") out.push("\n");
    else if (node.type === FILE_ATTACHMENT_NODE) out.push(`[${String(node.attrs?.filename ?? "file")}]`);
    else if (node.type === "mention") {
      const id = String(node.attrs?.id ?? "");
      out.push(mention(id, String(node.attrs?.label ?? id)));
    }
    const before = out.length;
    node.content?.forEach((child) => visit(child, depth + 1));
    if (!node.type || !BLOCKS.has(node.type)) return;
    // An empty block is a blank line of its own; a filled one ends its line once, however deep its children are.
    if (out.length === before || !out[out.length - 1].endsWith("\n")) out.push("\n");
  };
  visit(doc, 0);
  return out.join("").replace(/\n{3,}/g, "\n\n").trim();
}

const ATTACHMENT_URL = /^\/api\/attachments\/([\w-]+)$/;

/** Ids of the task files a stored description or comment shows (images and file cards). */
export function attachmentIdsInDoc(raw: string | null | undefined): Set<string> {
  const ids = new Set<string>();
  const doc = parseDoc(raw);
  if (!doc) return ids;
  const stack: { node: RichNode; depth: number }[] = [{ node: doc, depth: 0 }];
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (!node || typeof node !== "object" || depth > MAX_DEPTH) continue;
    const url = node.type === "image" ? node.attrs?.src : node.type === FILE_ATTACHMENT_NODE ? node.attrs?.href : null;
    const id = typeof url === "string" ? url.match(ATTACHMENT_URL)?.[1] : undefined;
    if (id) ids.add(id);
    node.content?.forEach((child) => stack.push({ node: child, depth: depth + 1 }));
  }
  return ids;
}

/** Files a text showed before an edit and no longer does. */
export function attachmentsRemoved(before: string | null | undefined, after: string | null | undefined): string[] {
  const now = attachmentIdsInDoc(after);
  return [...attachmentIdsInDoc(before)].filter((id) => !now.has(id));
}

/** A stored doc with every image or file card of this attachment removed; null when it showed none (nothing to rewrite). */
export function stripAttachment(raw: string | null | undefined, attachmentId: string): RichNode | null {
  const doc = parseDoc(raw);
  if (!doc || !attachmentIdsInDoc(raw).has(attachmentId)) return null;
  const shows = (node: RichNode) => {
    const url = node.type === "image" ? node.attrs?.src : node.type === FILE_ATTACHMENT_NODE ? node.attrs?.href : null;
    return typeof url === "string" && url.match(ATTACHMENT_URL)?.[1] === attachmentId;
  };
  const strip = (node: RichNode, depth: number): RichNode =>
    depth > MAX_DEPTH || !node.content
      ? node
      : { ...node, content: node.content.filter((child) => !shows(child)).map((child) => strip(child, depth + 1)) };
  return strip(doc, 0);
}
