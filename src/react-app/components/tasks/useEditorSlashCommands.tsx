import { useState } from "react";
import { Extension } from "@tiptap/react";
import { Suggestion } from "@tiptap/suggestion";
import { PluginKey } from "@tiptap/pm/state";
import { EditorBlockOptions } from "./EditorBlockOptions";
import { filterBlocks, type EditorBlock } from "./editorBlocks";
import { useSuggestionMenu } from "./useSuggestionMenu";

// Its own key: two suggestion plugins ("@" and "/") sharing the default key would overwrite each other's state.
const slashKey = new PluginKey("slashCommand");

/** "/" inside the description editor: a list of block types, applied to the line it was typed on. */
export function useEditorSlashCommands() {
  const menu = useSuggestionMenu<EditorBlock>();

  // Created once: tiptap keeps an extension's config for the editor's whole life.
  const [extension] = useState(() =>
      Extension.create({
        name: "slashCommand",
        addProseMirrorPlugins() {
          return [
            Suggestion<EditorBlock, EditorBlock>({
              pluginKey: slashKey,
              editor: this.editor,
              char: "/",
              items: ({ query }) => filterBlocks(query),
              // The "/query" text is removed, then the line becomes the picked block.
              command: ({ editor, range, props: block }) => {
                block.apply(editor.chain().focus().deleteRange(range)).run();
              },
              render: menu.render<EditorBlock>((props) => (block) => props.command(block)),
            }),
          ];
        },
      }),
  );

  const ui = menu.popover((items, active) => <EditorBlockOptions items={items} active={active} onPick={menu.choose} />, "w-56 p-1");

  return { extension, ui };
}
