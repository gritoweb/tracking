import { useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { X } from "lucide-react";

/** An image in rich text: a click opens it in the viewer (RichTextEditor), and an editable text offers an X to take it out. */
export function ImageView({ node, editor, deleteNode }: NodeViewProps) {
  const { src, alt } = node.attrs as { src: string; alt: string | null };
  const [gone, setGone] = useState(false);

  // A file deleted from the task shows nothing; an editable text also drops it, once the server confirms it's gone (not a blip).
  const onError = () => {
    setGone(true);
    if (!editor.isEditable) return;
    fetch(src, { method: "HEAD" })
      .then((res) => {
        if (res.status === 404) deleteNode();
      })
      .catch((e: unknown) => console.warn("image check failed", { src, error: String(e) }));
  };

  if (gone) return <NodeViewWrapper className="hidden" />;

  return (
    <NodeViewWrapper className="group relative w-fit min-w-12 max-w-full" data-drag-handle="">
      <img src={src} alt={alt ?? ""} draggable={false} onError={onError} />
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
