import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { FILE_ATTACHMENT_NODE } from "@shared/rich-doc";
import { FileCard } from "./FileCard";

/** A non-image file in a description or comment: a card with its name, kind and size that opens the viewer. */
export const FileAttachmentNode = Node.create({
  name: FILE_ATTACHMENT_NODE,
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      href: { default: null },
      filename: { default: "file" },
      contentType: { default: null },
      size: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-file-attachment]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-file-attachment": "" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FileCard);
  },
});
