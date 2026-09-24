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
const BLOCKS = new Set(["paragraph", "heading", "listItem", "taskItem", "codeBlock", "blockquote", "horizontalRule"]);

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
