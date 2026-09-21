// @vitest-environment jsdom
import { Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import { afterEach, describe, expect, it } from "vitest";
import { refreshMentionLabels } from "./mentionLabels";

const chip = (id: string, label: string): JSONContent => ({ type: "mention", attrs: { id, label } });
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content: [{ type: "paragraph", content }] });

const editors: Editor[] = [];
function editorWith(content: JSONContent) {
  const editor = new Editor({ extensions: [StarterKit, Mention], content });
  editors.push(editor);
  return editor;
}
const labels = (editor: Editor) =>
  ((editor.getJSON().content?.[0]?.content ?? []) as JSONContent[]).filter((n) => n.type === "mention").map((n) => n.attrs?.label);

afterEach(() => editors.splice(0).forEach((e) => e.destroy()));

describe("refreshMentionLabels", () => {
  it("shows a renamed person by their current name, in the document and on screen", () => {
    const editor = editorWith(doc({ type: "text", text: "cc " }, chip("u-ana", "Old Ana")));
    expect(refreshMentionLabels(editor, [{ userId: "u-ana", name: "Ana Silva" }])).toBe(true);
    expect(labels(editor)).toEqual(["Ana Silva"]);
    expect(editor.view.dom.textContent).toContain("@Ana Silva");
    expect(editor.view.dom.textContent).not.toContain("Old Ana");
  });

  it("changes nothing, and says so, when every label is already current", () => {
    const editor = editorWith(doc(chip("u-ana", "Ana Silva")));
    expect(refreshMentionLabels(editor, [{ userId: "u-ana", name: "Ana Silva" }])).toBe(false);
  });

  it("keeps the saved label of someone who is no longer a member", () => {
    const editor = editorWith(doc(chip("u-gone", "Gone Person"), chip("u-ana", "Old Ana")));
    refreshMentionLabels(editor, [{ userId: "u-ana", name: "Ana Silva" }]);
    expect(labels(editor)).toEqual(["Gone Person", "Ana Silva"]);
  });

  it("matches by id, so two people with the same name keep their own", () => {
    const editor = editorWith(doc(chip("u-1", "Old A"), chip("u-2", "Old B")));
    refreshMentionLabels(editor, [{ userId: "u-1", name: "Sam" }, { userId: "u-2", name: "Sam" }]);
    expect(labels(editor)).toEqual(["Sam", "Sam"]);
  });

  it("does nothing to a document with no mentions", () => {
    const editor = editorWith(doc({ type: "text", text: "plain" }));
    expect(refreshMentionLabels(editor, [{ userId: "u-ana", name: "Ana" }])).toBe(false);
  });

  it("does not land on the undo stack, so undo cannot bring the old name back", () => {
    const editor = editorWith(doc(chip("u-ana", "Old Ana")));
    refreshMentionLabels(editor, [{ userId: "u-ana", name: "Ana Silva" }]);
    expect(editor.can().undo()).toBe(false);
  });
});
