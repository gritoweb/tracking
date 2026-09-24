import { useState } from "react";
import { Extension, type Editor } from "@tiptap/react";
import { Suggestion, exitSuggestion, type SuggestionProps } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { EditorBlockOptions } from "./EditorBlockOptions";
import { filterBlocks, type EditorBlock } from "./editorBlocks";
import { useSuggestionMenu } from "./useSuggestionMenu";

// Its own key: two suggestion plugins ("@" and "/") sharing the default key would overwrite each other's state.
const slashKey = new PluginKey("slashCommand");

// Editors whose current "/" was typed by the "+" handle, not by the person.
const handleSlash = new WeakSet<Editor>();

/** Marks the "/" the "+" handle just inserted, so dismissing the menu removes it instead of leaving it in the text. */
export function markHandleSlash(editor: Editor) {
  handleSlash.add(editor);
}

/** Removes a "+"-inserted "/" still sitting alone; a "/" the person typed, or one they typed after, is theirs to keep. */
export function dropHandleSlash(editor: Editor) {
  if (!handleSlash.delete(editor)) return;
  const state = slashKey.getState(editor.state) as { active: boolean; range: { from: number; to: number } } | undefined;
  if (!state?.active) return;
  const { from, to } = state.range;
  if (editor.state.doc.textBetween(from, to) === "/") editor.chain().deleteRange({ from, to }).run();
}

/** "/" inside the description editor: a list of block types, applied to the line it was typed on. */
export function useEditorSlashCommands() {
  const menu = useSuggestionMenu<EditorBlock>();

  // Created once: tiptap keeps an extension's config for the editor's whole life.
  const [extension] = useState(() =>
    Extension.create({
      name: "slashCommand",
      addProseMirrorPlugins() {
        const editor = this.editor;
        return [
          Suggestion<EditorBlock, EditorBlock>({
            pluginKey: slashKey,
            editor,
            char: "/",
            items: ({ query }) => filterBlocks(query),
            // The "/query" text is removed, then the line becomes the picked block.
            command: ({ editor: e, range, props: block }) => {
              handleSlash.delete(e);
              block.apply(e.chain().focus().deleteRange(range)).run();
            },
            render: () => {
              const base = menu.render<EditorBlock>(
                (props) => (block) => props.command(block),
                (props) => {
                  dropHandleSlash(props.editor);
                  exitSuggestion(props.editor.view, slashKey);
                }
              )();
              return {
                ...base,
                onExit: (props: SuggestionProps<EditorBlock, EditorBlock>) => {
                  base.onExit();
                  // The caret left the "/" without a pick (a click elsewhere in the text).
                  if (handleSlash.has(editor) && editor.state.doc.textBetween(props.range.from, props.range.to) === "/") {
                    handleSlash.delete(editor);
                    editor.chain().deleteRange(props.range).run();
                  }
                },
              };
            },
          }),
        ];
      },
    })
  );

  const ui = menu.popover((items, active) => <EditorBlockOptions items={items} active={active} onPick={menu.choose} />, "w-56 p-1");

  return { extension, ui };
}
