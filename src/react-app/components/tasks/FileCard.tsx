import { useEffect, useRef, useState } from "react";
import { NodeViewWrapper, type NodeViewProps } from "@tiptap/react";
import { X } from "lucide-react";
import { fileExtension, formatFileSize } from "@shared/attachments";
import { FileIcon } from "./attachment-viewer/FileIcon";
import { attachmentIdFromHref, useOpenAttachment } from "./attachment-viewer/AttachmentViewerContext";

/** How a file in rich text looks: kind icon, name, type and size; a click opens it in the task's viewer. */
export function FileCard({ node, editor, deleteNode }: NodeViewProps) {
  const openAttachment = useOpenAttachment();
  const { href, filename, size } = node.attrs as { href: string; filename: string; size: number | null };
  const attachmentId = attachmentIdFromHref(href);
  const [gone, setGone] = useState(false);

  // A file deleted from the task shows nothing, and an editable text drops it; only a 404 counts, never a network blip.
  const drop = useRef(() => (editor.isEditable ? deleteNode() : undefined));
  useEffect(() => {
    drop.current = () => (editor.isEditable ? deleteNode() : undefined);
  });
  useEffect(() => {
    const controller = new AbortController();
    fetch(href, { method: "HEAD", signal: controller.signal })
      .then((res) => {
        if (res.status !== 404) return;
        setGone(true);
        drop.current();
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) console.warn("file check failed", { href, error: String(e) });
      });
    return () => controller.abort();
  }, [href]);

  const open = () => {
    if (attachmentId && openAttachment) openAttachment(attachmentId);
    // Outside a task (nothing to open it in), the file itself downloads.
    else window.open(href, "_blank", "noopener");
  };

  if (gone) return <NodeViewWrapper className="hidden" />;

  return (
    <NodeViewWrapper className="my-1.5" data-drag-handle="">
      <div className="group relative inline-flex max-w-full items-center gap-2.5 rounded-md border bg-muted/40 py-2 pr-8 pl-2.5 transition-colors duration-fast ease-out-quart hover:bg-muted">
        <button type="button" onClick={open} className="flex min-w-0 items-center gap-2.5 text-left" aria-label={`Open ${filename}`}>
          <FileIcon filename={filename} className="h-6 w-6 shrink-0 text-muted-foreground" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{filename}</span>
            <span className="block text-micro text-muted-foreground">
              {(fileExtension(filename) || "file").toUpperCase()}
              {size ? ` · ${formatFileSize(size)}` : ""}
            </span>
          </span>
        </button>
        {editor.isEditable && (
          <button
            type="button"
            onClick={deleteNode}
            aria-label={`Remove ${filename} from the text`}
            className="absolute top-1 right-1 hidden rounded-full p-0.5 text-muted-foreground group-hover:block hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </NodeViewWrapper>
  );
}
