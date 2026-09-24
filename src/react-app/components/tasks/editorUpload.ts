import { Extension } from "@tiptap/react";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { toastApiError } from "@/lib/toastApiError";

// Image upload inside a rich-text editor (description, comments): paste, drop or the toolbar's clip all land here.

export function imageFile(items: DataTransferItemList | FileList | null | undefined): File | null {
  if (!items) return null;
  for (const item of items) {
    const file = "getAsFile" in item ? item.getAsFile() : (item as File);
    if (file?.type.startsWith("image/")) return file;
  }
  return null;
}

interface PlaceholderSpec {
  id: string;
}

type PlaceholderAction = { add: { id: string; pos: number } } | { remove: { id: string } };

const uploadPlaceholderKey = new PluginKey<DecorationSet>("upload-placeholder");

function placeholderDOM(): HTMLElement {
  const span = document.createElement("span");
  span.textContent = "Uploading image…";
  span.style.opacity = "0.6";
  span.style.fontStyle = "italic";
  return span;
}

/** Tracks in-flight uploads as widget decorations mapped through every transaction, so an insert lands wherever the spot ended up rather than the position captured at upload time. */
function uploadPlaceholderPlugin() {
  return new Plugin<DecorationSet>({
    key: uploadPlaceholderKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, set) {
        set = set.map(tr.mapping, tr.doc);
        const action = tr.getMeta(uploadPlaceholderKey) as PlaceholderAction | undefined;
        if (action && "add" in action) {
          set = set.add(tr.doc, [
            Decoration.widget(action.add.pos, placeholderDOM, { id: action.add.id }),
          ]);
        } else if (action && "remove" in action) {
          const stale = set.find(undefined, undefined, (spec: PlaceholderSpec) => spec.id === action.remove.id);
          set = set.remove(stale);
        }
        return set;
      },
    },
    props: {
      decorations: (state) => uploadPlaceholderKey.getState(state),
    },
  });
}

export const UploadPlaceholderExtension = Extension.create({
  name: "uploadPlaceholder",
  addProseMirrorPlugins() {
    return [uploadPlaceholderPlugin()];
  },
});


function findPlaceholderPos(state: EditorState, id: string): number | null {
  const set = uploadPlaceholderKey.getState(state);
  const found = set?.find(undefined, undefined, (spec: PlaceholderSpec) => spec.id === id)?.[0];
  return found ? found.from : null;
}

/** Reserves `pos` with a placeholder immediately, then resolves the upload against wherever that spot mapped to — never the position captured at drop/paste time. */
export function insertUploadedImage(
  view: EditorView,
  pos: number,
  file: File,
  onUploadImage: (file: File) => Promise<{ url: string; id: string }>,
  onDeleteImage: ((id: string) => void) | undefined
) {
  const id = crypto.randomUUID();
  view.dispatch(view.state.tr.setMeta(uploadPlaceholderKey, { add: { id, pos } } satisfies PlaceholderAction));

  onUploadImage(file)
    .then(({ url, id: attachmentId }) => {
      const mappedPos = findPlaceholderPos(view.state, id);
      const tr = view.state.tr.setMeta(uploadPlaceholderKey, { remove: { id } } satisfies PlaceholderAction);
      if (mappedPos === null) {
        // The upload already succeeded but its target text is gone — insert nowhere, clean up instead.
        view.dispatch(tr);
        onDeleteImage?.(attachmentId);
        toastApiError(
          new Error("Upload target position was removed before it finished"),
          "Image uploaded but its spot in the text was deleted — removed"
        );
        return;
      }
      view.dispatch(tr.insert(mappedPos, view.state.schema.nodes.image.create({ src: url })));
    })
    .catch(() => {
      // The upload itself already reported its own error (type/size checks or the mutation's own toast).
      view.dispatch(view.state.tr.setMeta(uploadPlaceholderKey, { remove: { id } } satisfies PlaceholderAction));
    });
}
