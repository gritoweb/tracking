import { useState } from "react";
import { Paperclip, X } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { TaskAttachment } from "@shared/schemas";

function AttachmentThumb({ attachment, onOpen, onDelete }: { attachment: TaskAttachment; onOpen: () => void; onDelete: () => void }) {
  return (
    <div className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-md border bg-muted">
      <button type="button" onClick={onOpen} className="h-full w-full" aria-label={`Open ${attachment.filename}`}>
        <img src={attachment.url} alt={attachment.filename} className="h-full w-full object-cover" />
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
  onOpenLightbox: (attachment: TaskAttachment) => void;
  onDelete: (attachmentId: string) => void;
}

/**
 * Read-only gallery — nothing is ever uploaded here. Everything sent through the
 * description or a comment lands in this task's own attachments, and shows up here
 * as a convenience, last on the panel, same as the ClickUp reference's own Anexos.
 */
export function TaskAttachments({ attachments, loading, onOpenLightbox, onDelete }: TaskAttachmentsProps) {
  const [pendingDelete, setPendingDelete] = useState<TaskAttachment | null>(null);

  return (
    <div className="space-y-1.5">
      <Label className="text-base font-semibold">Attachments</Label>
      {loading ? (
        <Skeleton className="h-20 w-20" />
      ) : attachments.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <AttachmentThumb key={a.id} attachment={a} onOpen={() => onOpenLightbox(a)} onDelete={() => setPendingDelete(a)} />
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-micro text-muted-foreground">
          <Paperclip className="h-3 w-3" />
          Sent through the description or a comment — nothing to show yet.
        </p>
      )}

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
