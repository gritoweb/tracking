import type { Editor } from "@tiptap/react";

/** Rewrites each mention chip's saved label to the person's current name (matched by id); returns whether anything changed. */
export function refreshMentionLabels(editor: Editor, members: { userId: string; name: string }[]): boolean {
  const names = new Map(members.map((m) => [m.userId, m.name]));
  const tr = editor.state.tr;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "mention") return;
    const current = names.get(String(node.attrs.id));
    if (current && current !== node.attrs.label) tr.setNodeMarkup(pos, undefined, { ...node.attrs, label: current });
  });
  if (!tr.docChanged) return false;
  // Not an edit of the person's: it must not land on the undo stack.
  editor.view.dispatch(tr.setMeta("addToHistory", false));
  return true;
}
