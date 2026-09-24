import { describe, expect, it } from "vitest";
import { commentDoc, commentText, legacyCommentToDoc } from "./comment-body";
import { mentionedIds } from "./mentions";
import { docToText, parseDoc } from "./rich-doc";

const doc = (...content: object[]) => JSON.stringify({ type: "doc", content });
const p = (...content: object[]) => ({ type: "paragraph", content });
const text = (t: string) => ({ type: "text", text: t });
const mention = (id: string, label: string) => ({ type: "mention", attrs: { id, label } });

describe("commentText", () => {
  it("passes a legacy text body through untouched", () => {
    const body = "Hi @[Ana](user:u1), see this";
    expect(commentText(body)).toBe(body);
  });

  it("reads a rich body as lines, with mentions in the same token form the server already parses", () => {
    const body = doc(p(text("Hi "), mention("u1", "Ana")), p(text("second line")));
    expect(commentText(body)).toBe("Hi @[Ana](user:u1)\nsecond line");
    expect(mentionedIds(commentText(body))).toEqual(["u1"]);
  });

  it("reads lists, headings and code blocks one line each", () => {
    const body = doc(
      { type: "heading", attrs: { level: 2 }, content: [text("Title")] },
      { type: "bulletList", content: [{ type: "listItem", content: [p(text("one"))] }, { type: "listItem", content: [p(text("two"))] }] },
      { type: "codeBlock", content: [text("npm run")] }
    );
    expect(commentText(body)).toBe("Title\none\ntwo\nnpm run");
  });

  it("treats JSON that isn't a doc as text", () => {
    expect(commentText('{"type":"other"}')).toBe('{"type":"other"}');
  });
});

describe("legacyCommentToDoc / commentDoc", () => {
  it("turns an old body into a doc with its lines and mentions, and back into the same text", () => {
    const body = "Hi @[Ana](user:u1)\n\nbye";
    const asDoc = legacyCommentToDoc(body);
    expect(asDoc.content).toHaveLength(3);
    expect(asDoc.content?.[0].content?.[1]).toEqual({ type: "mention", attrs: { id: "u1", label: "Ana" } });
    expect(commentText(JSON.stringify(asDoc))).toBe(body);
  });

  it("returns a rich body's own doc", () => {
    const body = doc(p(text("x")));
    expect(commentDoc(body)).toEqual(JSON.parse(body));
  });
});

describe("docToText", () => {
  it("stops at a hostile depth instead of blowing the stack", () => {
    let node: object = text("deep");
    for (let i = 0; i < 1000; i++) node = { type: "blockquote", content: [node] };
    const parsed = parseDoc(doc(node));
    expect(() => docToText(parsed!, () => "")).not.toThrow();
  });
});
