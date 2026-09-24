// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Editor, type JSONContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { dropIndex, moveBlocks } from "./blockDrop";

const p = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] });
const list = (...items: string[]): JSONContent => ({
  type: "bulletList",
  content: items.map((t) => ({ type: "listItem", content: [p(t)] })),
});

let editor: Editor;
afterEach(() => editor?.destroy());

function make(...content: JSONContent[]) {
  editor = new Editor({ extensions: [StarterKit.configure({ trailingNode: false })], content: { type: "doc", content } });
  return editor;
}

/** [from, to) of the nth top-level block. */
function range(index: number): [number, number] {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += editor.state.doc.child(i).nodeSize;
  return [pos, pos + editor.state.doc.child(index).nodeSize];
}

const texts = () => editor.state.doc.content.content.map((n) => n.textContent);

function move(block: number, gap: number) {
  const [from, to] = range(block);
  const tr = moveBlocks(editor.state, from, to, gap);
  if (tr) editor.view.dispatch(tr);
  return tr;
}

describe("dropIndex", () => {
  const rects = [
    { top: 0, bottom: 20 },
    { top: 20, bottom: 60 },
    { top: 60, bottom: 80 },
  ];

  it("picks the gap by height: above a block's middle is before it, below is after it", () => {
    expect(dropIndex(rects, -50)).toBe(0);
    expect(dropIndex(rects, 9)).toBe(0);
    expect(dropIndex(rects, 11)).toBe(1);
    expect(dropIndex(rects, 39)).toBe(1);
    expect(dropIndex(rects, 41)).toBe(2);
    expect(dropIndex(rects, 500)).toBe(3);
  });
});

describe("moveBlocks", () => {
  it("moves a block down past others", () => {
    make(p("a"), p("b"), p("c"));
    move(0, 3);
    expect(texts()).toEqual(["b", "c", "a"]);
  });

  it("moves a block up to the top", () => {
    make(p("a"), p("b"), p("c"));
    move(2, 0);
    expect(texts()).toEqual(["c", "a", "b"]);
  });

  it("does nothing when dropped back where it came from", () => {
    make(p("a"), p("b"), p("c"));
    expect(move(1, 1)).toBeNull();
    expect(move(1, 2)).toBeNull();
    expect(texts()).toEqual(["a", "b", "c"]);
  });

  it("moves a whole list as one block and never nests it into a neighbour", () => {
    make(p("a"), list("one", "two"), p("b"));
    move(1, 3);
    expect(editor.state.doc.childCount).toBe(3);
    expect(editor.state.doc.child(2).type.name).toBe("bulletList");
    expect(texts()).toEqual(["a", "b", "onetwo"]);
  });
});
