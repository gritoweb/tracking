// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { plainTextToSlice } from "./pastePlainText";

let editor: Editor;
afterEach(() => editor?.destroy());

function make() {
  editor = new Editor({
    extensions: [StarterKit],
    editorProps: {
      clipboardTextParser: (text, $context, _plain, view) => plainTextToSlice(text, view.state.schema, $context.marks()),
    },
  });
  return editor;
}

// jsdom has no ClipboardEvent, which pasteText builds when given none.
const paste = (text: string) => editor.view.pasteText(text, new Event("paste") as ClipboardEvent);
const lines = () => editor.state.doc.content.content.map((n) => n.textContent);

describe("pasting plain text", () => {
  it("keeps every blank line as an empty paragraph", () => {
    make();
    paste("Intro\n\nVTurb\nPlano: R$ 97\n\n\nMux");
    expect(lines()).toEqual(["Intro", "", "VTurb", "Plano: R$ 97", "", "", "Mux"]);
  });

  it("reads Windows line endings and drops only the clipboard's trailing newline", () => {
    make();
    paste("one\r\n\r\ntwo\r\n");
    expect(lines()).toEqual(["one", "", "two"]);
  });

  it("joins a single line into the paragraph at the caret", () => {
    make().commands.setContent("<p>abc</p>");
    editor.commands.setTextSelection(4);
    paste("XYZ");
    expect(lines()).toEqual(["abcXYZ"]);
  });
});
