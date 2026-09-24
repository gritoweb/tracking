import type { Editor } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import { TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";

/** Which gap between top-level blocks a pointer at `y` points to: 0 is above the first, `rects.length` below the last. */
export function dropIndex(rects: { top: number; bottom: number }[], y: number): number {
  const i = rects.findIndex((r) => y < r.top + (r.bottom - r.top) / 2);
  return i === -1 ? rects.length : i;
}

/** Start position of each top-level block, plus the doc's end, so `starts[i]` is the gap before block i. */
function blockStarts(doc: PMNode): number[] {
  const starts: number[] = [];
  doc.forEach((_node, offset) => starts.push(offset));
  starts.push(doc.content.size);
  return starts;
}

/** Moves the top-level blocks in `[from, to)` to the gap `index`; null when that gap is where they already are. */
export function moveBlocks(state: EditorState, from: number, to: number, index: number): Transaction | null {
  const starts = blockStarts(state.doc);
  const target = starts[Math.max(0, Math.min(index, starts.length - 1))];
  if (target >= from && target <= to) return null;
  const content = state.doc.slice(from, to).content;
  const tr = state.tr.delete(from, to);
  const at = tr.mapping.map(target);
  tr.insert(at, content);
  return tr.setSelection(TextSelection.near(tr.doc.resolve(at + 1)));
}

// A 1×1 transparent image: the native drag ghost follows the pointer sideways, and this drag only goes up and down.
const EMPTY_DRAG_IMAGE = (() => {
  if (typeof Image === "undefined") return null;
  const img = new Image();
  img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  return img;
})();

/** Takes over the handle's drag: the drop gap is chosen by height only, between top-level blocks, and marked by a line. */
export function armVerticalDrag(editor: Editor) {
  const { view } = editor;
  let from = 0;
  let to = 0;
  let index = -1;
  let dimmed: HTMLElement[] = [];
  const line = document.createElement("div");
  line.className = "tt-drop-line";

  const rects = () => {
    const out: DOMRect[] = [];
    view.state.doc.forEach((_node, offset) => {
      const dom = view.nodeDOM(offset);
      if (dom instanceof HTMLElement) out.push(dom.getBoundingClientRect());
    });
    return out;
  };

  const place = (y: number) => {
    const all = rects();
    if (!all.length) return;
    index = dropIndex(all, y);
    const edge = index < all.length ? all[index].top : all[all.length - 1].bottom;
    const box = view.dom.getBoundingClientRect();
    const inset = parseFloat(getComputedStyle(view.dom).paddingLeft) || 0;
    line.style.top = `${edge - 1}px`;
    line.style.left = `${box.left + inset}px`;
    line.style.width = `${box.width - inset}px`;
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    // Ours alone: ProseMirror's own dragover would draw its drop cursor at a spot this drag won't use.
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
    place(e.clientY);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const tr = index >= 0 ? moveBlocks(view.state, from, to, index) : null;
    if (tr) view.dispatch(tr.scrollIntoView());
    view.focus();
    cleanup();
  };

  const cleanup = () => {
    document.removeEventListener("dragover", onDragOver, true);
    document.removeEventListener("drop", onDrop, true);
    document.removeEventListener("dragend", cleanup, true);
    line.remove();
    dimmed.forEach((el) => el.classList.remove("tt-drag-source"));
    dimmed = [];
    // The handle sits outside the editor, so ProseMirror never sees this drag end and would treat a later file drop as a move.
    view.dragging = null;
  };

  // Runs after the plugin's own dragstart work (it sets the selection and its drag image), so this one wins.
  const onDragStart = (e: DragEvent) => {
    document.removeEventListener("dragstart", onDragStart);
    ({ from, to } = view.state.selection);
    if (EMPTY_DRAG_IMAGE) e.dataTransfer?.setDragImage(EMPTY_DRAG_IMAGE, 0, 0);
    view.state.doc.nodesBetween(from, to, (_node, pos) => {
      const dom = view.nodeDOM(pos);
      if (dom instanceof HTMLElement) dimmed.push(dom);
      return false;
    });
    dimmed.forEach((el) => el.classList.add("tt-drag-source"));
    document.body.appendChild(line);
    document.addEventListener("dragover", onDragOver, true);
    document.addEventListener("drop", onDrop, true);
    document.addEventListener("dragend", cleanup, true);
  };
  document.addEventListener("dragstart", onDragStart);
}
