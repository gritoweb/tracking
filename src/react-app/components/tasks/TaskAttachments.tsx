import { useRef, useState } from "react";
import { toast } from "sonner";
import { Paperclip, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { attachmentProblem } from "@/lib/taskCommentAttachments";
import { FileIcon } from "./attachment-viewer/FileIcon";
import { ATTACHMENT_ACCEPT, MAX_ATTACHMENT_LABEL, fileExtension, formatFileSize, isImageContentType } from "@shared/attachments";
import { cn } from "@/lib/utils";
import type { TaskAttachment } from "@shared/schemas";

function AttachmentThumb({ attachment, onOpen, onDelete }: { attachment: TaskAttachment; onOpen: () => void; onDelete: () => void }) {
  const image = isImageContentType(attachment.contentType);
  const ext = fileExtension(attachment.filename);
  return (
    <div className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-md border bg-muted">
      <button type="button" onClick={onOpen} className="h-full w-full" aria-label={`Open ${attachment.filename}`} title={attachment.filename}>
        {image ? (
          <img src={attachment.url} alt={attachment.filename} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full flex-col items-center justify-center gap-1 px-1.5">
            <FileIcon filename={attachment.filename} className="h-6 w-6 text-muted-foreground" />
            <span className="w-full truncate text-center text-micro font-medium">{attachment.filename}</span>
            <span className="text-micro text-muted-foreground">
              {ext.toUpperCase()} · {formatFileSize(attachment.size)}
            </span>
          </span>
        )}
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${attachment.filename}`}
        className="absolute right-1 top-1 hidden rounded-full bg-background/90 p-0.5 text-muted-foreground group-hover:block hover:text-destructive"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

interface TaskAttachmentsProps {
  attachments: TaskAttachment[];
  loading: boolean;
  onOpen: (attachment: TaskAttachment) => void;
  onDelete: (attachmentId: string) => void;
  /** Sends one file; the promise settles when it is stored (a refusal is the caller's toast, not ours). */
  onUpload: (file: File) => Promise<unknown>;
}

/**
 * The task's files: images sent through the description or a comment, and images or documents attached
 * here with the button or by dropping them on the area (`attachmentProblem`, then the server's own check).
 */
export function TaskAttachments({ attachments, loading, onOpen, onDelete, onUpload }: TaskAttachmentsProps) {
  const [pendingDelete, setPendingDelete] = useState<TaskAttachment | null>(null);
  const [uploading, setUploading] = useState(0);
  const [dragging, setDragging] = useState(false);
  const picker = useRef<HTMLInputElement>(null);

  const send = async (files: File[]) => {
    for (const file of files) {
      const problem = attachmentProblem(file);
      if (problem) {
        toast.error(problem);
        continue;
      }
      setUploading((n) => n + 1);
      try {
        await onUpload(file);
      } catch {
        // The upload already reported its own error.
      } finally {
        setUploading((n) => n - 1);
      }
    }
  };

  return (
    <div
      className={cn("space-y-1.5 rounded-md", dragging && "bg-primary/5 ring-2 ring-primary/30")}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void send([...e.dataTransfer.files]);
      }}
    >
      <Label className="text-base font-semibold">Attachments</Label>
      {loading ? (
        <Skeleton className="h-20 w-20" />
      ) : attachments.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <AttachmentThumb key={a.id} attachment={a} onOpen={() => onOpen(a)} onDelete={() => setPendingDelete(a)} />
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-micro text-muted-foreground">
          <Paperclip className="h-3 w-3" />
          Nothing attached yet — attach a file, drop it here, or paste an image into the description or a comment.
        </p>
      )}

      {/* Below what's there, not beside the title: the action follows the content it adds to. */}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => picker.current?.click()} disabled={uploading > 0}>
          {uploading > 0 ? <Spinner size="sm" /> : <Paperclip className="h-3.5 w-3.5" />}
          Attach file
        </Button>
        <p className="mt-1.5 text-micro text-muted-foreground">
          Images, PDF, Word, Excel, PowerPoint, TXT or CSV — up to {MAX_ATTACHMENT_LABEL} each.
        </p>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          accept={ATTACHMENT_ACCEPT}
          aria-label="Choose files to attach"
          onChange={(e) => {
            void send([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title={`Delete ${pendingDelete?.filename ?? "attachment"}?`}
        description="This can't be undone."
        onConfirm={() => {
          if (pendingDelete) onDelete(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
