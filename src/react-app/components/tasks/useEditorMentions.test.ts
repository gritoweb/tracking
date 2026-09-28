// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";
import { Mention } from "@tiptap/extension-mention";
import { setMentionMembers } from "./useEditorMentions";
import { refreshMentionLabels } from "@/lib/mentionLabels";

const member = { userId: "u1", name: "Ana", email: "ana@x.test", image: null, role: "member" } as never;

function editorWithMentions() {
  return new Editor({
    extensions: [StarterKit, Mention.extend({ addStorage: () => ({ members: [] }) })],
  });
}

describe("setMentionMembers", () => {
  it("hands a live editor the team", () => {
    const editor = editorWithMentions();
    setMentionMembers(editor, [member]);
    expect(editor.storage.mention.members).toEqual([member]);
    editor.destroy();
  });

  // Opening a task swaps its collaborative document, which destroys the editor; an effect can still hold the old one.
  it("ignores an editor that was already destroyed instead of crashing the page", () => {
    const editor = editorWithMentions();
    editor.destroy();
    expect(() => setMentionMembers(editor, [member])).not.toThrow();
  });

  it("leaves a destroyed editor's chips alone too", () => {
    const editor = editorWithMentions();
    editor.commands.setContent({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "mention", attrs: { id: "u1", label: "Old name" } }] }],
    });
    editor.destroy();
    expect(refreshMentionLabels(editor as never, [{ userId: "u1", name: "Ana" }])).toBe(false);
  });
});
