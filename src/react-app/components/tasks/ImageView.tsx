import { useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { ImageOff, X } from "lucide-react";

/** An image in rich text: a click opens it in the viewer (RichTextEditor), and an editable text offers an X to take it out. */
export function ImageView({ node, editor, deleteNode }: NodeViewProps) {
  const { src, alt } = node.attrs as { src: string; alt: string | null };
  const [broken, setBroken] = useState(false);

  return (
    <NodeViewWrapper className="group relative w-fit min-w-12 max-w-full" data-drag-handle="">
      {broken ? (
        <span className="my-2 flex items-center gap-2 rounded-md border px-3 py-2 text-xs text-muted-foreground">
          <ImageOff className="h-4 w-4" />
          This image was removed from the task
        </span>
      ) : (
        <img src={src} alt={alt ?? ""} draggable={false} onError={() => setBroken(true)} />
      )}
      {editor.isEditable && (
        <button
          type="button"
          onClick={deleteNode}
          aria-label="Remove image from the text"
          title="Remove from the text"
          className="absolute top-3 right-1 hidden rounded-full bg-background/90 p-1 text-muted-foreground group-hover:block hover:text-destructive"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </NodeViewWrapper>
  );
}
