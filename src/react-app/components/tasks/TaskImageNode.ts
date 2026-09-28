import { Image } from "@tiptap/extension-image";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { ImageView } from "./ImageView";

/** The editor's image, rendered by `ImageView` so it can be opened and removed with the mouse. */
export const TaskImageNode = Image.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
});
