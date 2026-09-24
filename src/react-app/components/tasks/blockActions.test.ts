// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Editor, type JSONContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { colorBlock, deleteBlock, duplicateBlock, insertBelowWithSlash, turnBlockInto, type HandleTarget } from "./blockActions";
import { EDITOR_BLOCKS, TURN_INTO_BLOCKS, filterBlocks } from "./editorBlocks";
import { SWATCH_COLORS } from "@shared/colors";

const p = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] });

let editor: Editor;
afterEach(() => editor?.destroy());

function make(...content: JSONContent[]) {
  editor = new Editor({
    extensions: [StarterKit, TaskList, TaskItem, TextStyle, Color],
    content: { type: "doc", content },
  });
  return editor;
}

/** The handle's target for the nth top-level block. */
function top(index: number): HandleTarget {
  let pos = 0;
  for (let i = 0; i < index; i++) pos += editor.state.doc.child(i).nodeSize;
  return { node: editor.state.doc.child(index), pos };
}

const texts = () => editor.state.doc.content.content.map((n) => n.textContent);

describe("block handle actions", () => {
  it("duplicates a block right below itself", () => {
    make(p("one"), p("two"));
    duplicateBlock(editor, top(0));
    expect(texts()).toEqual(["one", "one", "two"]);
  });

  it("deletes only the targeted block", () => {
    make(p("one"), p("two"), p("three"));
    deleteBlock(editor, top(1));
    expect(texts()).toEqual(["one", "three"]);
  });

  it("'+' adds a line below holding '/' with the caret after it", () => {
    make(p("one"), p("two"));
    insertBelowWithSlash(editor, top(0));
    expect(texts()).toEqual(["one", "/", "two"]);
    const { $from } = editor.state.selection;
    expect($from.parent.textContent).toBe("/");
    expect($from.parentOffset).toBe(1);
  });

  it("'+' on an empty line opens the menu on that line instead of adding another", () => {
    make(p("a"), { type: "paragraph" }, p("b"));
    insertBelowWithSlash(editor, top(1));
    expect(texts()).toEqual(["a", "/", "b"]);
    expect(editor.state.selection.$from.parent.textContent).toBe("/");
  });

  it("'+' on a checklist item adds an unchecked sibling item, not a paragraph that splits the list", () => {
    make({
      type: "taskList",
      content: [{ type: "taskItem", attrs: { checked: true }, content: [p("done")] }],
    });
    const list = editor.state.doc.child(0);
    insertBelowWithSlash(editor, { node: list.child(0), pos: 1 });
    const items = editor.state.doc.child(0);
    expect(items.type.name).toBe("taskList");
    expect(items.childCount).toBe(2);
    expect(items.child(1).attrs.checked).toBe(false);
    expect(items.child(1).textContent).toBe("/");
  });

  it("turns a paragraph into a heading", () => {
    make(p("title"), p("body"));
    const h2 = EDITOR_BLOCKS.find((b) => b.id === "h2")!;
    turnBlockInto(editor, top(0), h2);
    expect(editor.state.doc.child(0).type.name).toBe("heading");
    expect(editor.state.doc.child(0).attrs.level).toBe(2);
    expect(editor.state.doc.child(1).type.name).toBe("paragraph");
  });

  it("colors the whole line and can reset it", () => {
    make(p("paint me"));
    const swatch = SWATCH_COLORS[0];
    colorBlock(editor, top(0), swatch);
    const mark = () => editor.state.doc.child(0).child(0).marks.find((m) => m.type.name === "textStyle");
    expect(mark()?.attrs.color).toBe(swatch);
    colorBlock(editor, top(0), null);
    expect(mark()?.attrs.color ?? null).toBeNull();
  });
});

describe("block catalogue", () => {
  it("offers code block and divider under '/', with pt-BR keywords", () => {
    expect(filterBlocks("codigo").map((b) => b.id)).toContain("code");
    expect(filterBlocks("divisor").map((b) => b.id)).toContain("divider");
  });

  it("'Turn into' leaves out blocks that insert a node", () => {
    expect(TURN_INTO_BLOCKS.map((b) => b.id)).toContain("code");
    expect(TURN_INTO_BLOCKS.map((b) => b.id)).not.toContain("divider");
  });
});
