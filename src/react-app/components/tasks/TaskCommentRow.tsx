import { useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { AttachmentPreview } from "./TaskCommentAttachment";
import { MentionPicker } from "./TaskCommentMentionPicker";
import { useUploadTaskAttachment } from "@/hooks/useTasks";
import { ACCEPTED_TYPES, MAX_ATTACHMENT_BYTES, imageFile } from "@/lib/taskCommentAttachments";
import type { Member } from "./TaskComments";
import type { TaskComment } from "@shared/schemas";

/** One comment row, or its own edit form when the author is editing it in place. */
export function CommentRow({
  comment,
  taskId,
  members,
  isAuthor,
  onDelete,
  onSave,
}: {
  comment: TaskComment;
  taskId: string;
  members: Member[];
  isAuthor: boolean;
  onDelete: () => void;
  onSave: (body: string, mentionedUserIds: string[], attachmentId: string | null) => void;
}) {
  const uploadAttachment = useUploadTaskAttachment();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(comment.body);
  const [mentioned, setMentioned] = useState(comment.mentionedUserIds);
  const [attachment, setAttachment] = useState<{ id: string; url: string } | null>(
    comment.attachmentId && comment.attachmentUrl ? { id: comment.attachmentId, url: comment.attachmentUrl } : null
  );

  const attach = async (file: File | null) => {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) return toast.error("Only PNG, JPEG, WebP and GIF images are accepted");
    if (file.size > MAX_ATTACHMENT_BYTES) return toast.error("Image is larger than 10 MB");
    const uploaded = await uploadAttachment.mutateAsync({ taskId, file });
    setAttachment({ id: uploaded.id, url: uploaded.url });
  };

  if (editing) {
    return (
      <div className="flex gap-2.5 px-3 py-2.5">
        <UserAvatar name={comment.userName} image={comment.userImage} className="h-7 w-7 shrink-0" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Textarea
            aria-label="Edit comment"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onPaste={(e) => attach(imageFile(e.clipboardData?.items))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              attach(imageFile(e.dataTransfer?.files));
            }}
            rows={2}
            autoFocus
          />
          {attachment && <AttachmentPreview url={attachment.url} onRemove={() => setAttachment(null)} />}
          <MentionPicker members={members} value={mentioned} onChange={setMentioned} />
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!body.trim()}
              onClick={() => {
                onSave(body.trim(), mentioned, attachment?.id ?? null);
                setEditing(false);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex gap-2.5 px-3 py-2.5">
      <UserAvatar name={comment.userName} image={comment.userImage} className="h-7 w-7 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium">{comment.userName}</span>
          <span className="text-micro text-muted-foreground">
            {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
            {comment.editedAt && " · edited"}
          </span>
        </div>
        {comment.attachmentUrl && (
          <div className="pb-1.5 pt-1">
            <AttachmentPreview url={comment.attachmentUrl} filename={comment.attachmentFilename} />
          </div>
        )}
        <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
      </div>
      {isAuthor && (
        <div className="tt-reveal flex shrink-0 items-start gap-0.5">
          <Button variant="ghost" size="icon-xs" aria-label="Edit comment" onClick={() => setEditing(true)}>
            <Pencil className="h-3 w-3" />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label="Delete comment" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}
