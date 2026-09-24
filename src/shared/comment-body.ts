import { mentionToken, splitMentions } from "./mentions";
import { docToText, parseDoc, type RichNode } from "./rich-doc";

// A body is legacy text or the description's tiptap doc; every server reader goes through `commentText`.

/** The body as text with mentions as `@[Name](user:ID)`: what notifications, mention lookup and MCP read. */
export function commentText(body: string): string {
  const doc = parseDoc(body);
  return doc ? docToText(doc, (id, label) => mentionToken(label, id)) : body;
}

/** A legacy text body as a doc, so an old comment opens in the rich editor with its lines and mentions intact. */
export function legacyCommentToDoc(body: string): RichNode {
  const paragraphs: RichNode[] = body.split("\n").map((line) => ({
    type: "paragraph",
    content: splitMentions(line)
      .filter((s) => s.type === "mention" || s.text)
      .map((s) =>
        s.type === "text"
          ? { type: "text", text: s.text }
          : { type: "mention", attrs: { id: s.userId, label: s.label } }
      ),
  }));
  return { type: "doc", content: paragraphs.map((p) => (p.content?.length ? p : { type: "paragraph" })) };
}

/** Either kind of body as a doc for the editor. */
export function commentDoc(body: string): RichNode {
  return parseDoc(body) ?? legacyCommentToDoc(body);
}

/** Nothing to post: no text, no mention and no image, in either kind of body. */
export function commentIsEmpty(body: string): boolean {
  const doc = parseDoc(body);
  if (!doc) return !body.trim();
  const stack: RichNode[] = [doc];
  // Depth is bounded by what parseDoc/docToText accept; an image or a mention counts as content with no text.
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === "image" || node.type === "mention" || (node.type === "text" && node.text?.trim())) return false;
    node.content?.forEach((child) => stack.push(child));
  }
  return true;
}
