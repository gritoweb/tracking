import type { Editor, JSONContent } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import type { EditorBlock } from "./editorBlocks";
import { markHandleSlash } from "./useEditorSlashCommands";

/** The block the handle is sitting on: the node and where it starts in the doc. */
export interface HandleTarget {
  node: PMNode;
  pos: number;
}

const LIST_ITEMS = new Set(["listItem", "taskItem"]);

function end({ node, pos }: HandleTarget) {
  return pos + node.nodeSize;
}

/** A new empty line right after the target, already holding "/" so the block menu opens on it. */
export function insertBelowWithSlash(editor: Editor, target: HandleTarget) {
  // An empty line is itself the new line: the menu opens on it rather than on yet another one below.
  if (target.node.type.name === "paragraph" && target.node.content.size === 0) {
    markHandleSlash(editor);
    return editor.chain().focus().insertContentAt(target.pos + 1, "/").setTextSelection(target.pos + 2).run();
  }
  const paragraph: JSONContent = { type: "paragraph", content: [{ type: "text", text: "/" }] };
  const name = target.node.type.name;
  // Inside a list the sibling must be another item, or the schema would split the list.
  const line: JSONContent = LIST_ITEMS.has(name)
    ? { type: name, ...(name === "taskItem" ? { attrs: { checked: false } } : {}), content: [paragraph] }
    : paragraph;
  const at = end(target);
  // +1 steps into the new line (+1 more for the item's paragraph), landing the caret after "/".
  const caret = at + (LIST_ITEMS.has(name) ? 3 : 2);
  markHandleSlash(editor);
  return editor.chain().focus().insertContentAt(at, line).setTextSelection(caret).run();
}

export function duplicateBlock(editor: Editor, target: HandleTarget) {
  return editor.chain().focus().insertContentAt(end(target), target.node.toJSON()).run();
}

export function deleteBlock(editor: Editor, target: HandleTarget) {
  return editor.chain().focus().deleteRange({ from: target.pos, to: end(target) }).run();
}

/** Selects the block's text so a toggle or a mark applies to the whole line, as the "/" menu does to the caret's line. */
function selectContent(editor: Editor, target: HandleTarget) {
  return editor.chain().focus().setTextSelection({ from: target.pos + 1, to: end(target) - 1 });
}

export function turnBlockInto(editor: Editor, target: HandleTarget, block: EditorBlock) {
  return block.apply(selectContent(editor, target)).run();
}

export function colorBlock(editor: Editor, target: HandleTarget, color: string | null) {
  const chain = selectContent(editor, target);
  return (color ? chain.setColor(color) : chain.unsetColor()).run();
}
