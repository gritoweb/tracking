import { useState, type ReactNode } from "react";
import type { JSONContent } from "@tiptap/react";
import { formatStamp } from "@/lib/dateUtils";
import { useUIStore } from "@/stores/uiStore";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useEscapeLocal } from "@/hooks/useEscapeLocal";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { AttachmentPreview } from "./TaskCommentAttachment";
import { CommentComposer } from "./CommentComposer";
import { RichTextEditor } from "./RichTextEditor";
import { useTaskImageUpload } from "@/hooks/useTaskImageUpload";
import { commentDoc } from "@shared/comment-body";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";
import type { TaskComment } from "@shared/schemas";

/** One comment as its own card; editing happens in that same card, under the same header, with the description's editor. */
export function CommentRow({
  comment,
  taskId,
  members,
  isAuthor,
  canDelete,
  onDelete,
  onSave,
}: {
  comment: TaskComment;
  taskId: string;
  members: WorkspaceMember[];
  isAuthor: boolean;
  canDelete: boolean;
  onDelete: () => void;
  onSave: (body: string, attachmentId: string | null) => void;
}) {
  const timeFormat = useUIStore((s) => s.timeFormat);
  const [editing, setEditing] = useState(false);
  const { uploadImage, deleteOrphanedImage } = useTaskImageUpload(taskId);
  const escapeLocal = useEscapeLocal(() => setEditing(false));
  // Old comments are text with @[Name](user:ID) tags; both kinds open as the same doc.
  const doc = commentDoc(comment.body) as JSONContent;

  const header = (actions?: ReactNode) => (
    <div className="flex items-center gap-2">
      <UserAvatar name={comment.userName} image={comment.userImage} className="h-6 w-6 shrink-0" />
      <span className="truncate text-sm font-medium">{comment.userName}</span>
      <span className="shrink-0 text-micro text-muted-foreground">
        {formatStamp(comment.createdAt, timeFormat)}
        {comment.editedAt && " · edited"}
      </span>
      {actions}
    </div>
  );

  // An image sent with an old comment (before images went inline) stays shown, and stays attached through an edit.
  const legacyAttachment = comment.attachmentUrl ? (
    <AttachmentPreview url={comment.attachmentUrl} filename={comment.attachmentFilename} />
  ) : null;

  if (editing) {
    return (
      // Esc cancels the edit (a "/" or "@" menu open above takes its own Esc first).
      <Card size="compact" look="outlined" {...escapeLocal}>
        {header()}
        {legacyAttachment}
        <CommentComposer
          initial={doc}
          members={members}
          onUploadImage={uploadImage}
          onDeleteImage={deleteOrphanedImage}
          onSubmit={(body) => {
            onSave(body, comment.attachmentId ?? null);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
          submitLabel="Save"
          autoFocus
        />
      </Card>
    );
  }

  return (
    <Card size="compact" look="outlined" className="group">
      {header(
        (isAuthor || canDelete) && (
          <div className="tt-reveal ml-auto flex shrink-0 items-center gap-0.5">
            {isAuthor && (
              <Button variant="ghost" size="icon-xs" aria-label="Edit comment" onClick={() => setEditing(true)}>
                <Pencil className="h-3 w-3" />
              </Button>
            )}
            {canDelete && (
              <Button variant="ghost" size="icon-xs" aria-label="Delete comment" onClick={onDelete}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        )
      )}
      {legacyAttachment}
      <RichTextEditor readOnly density="compact" aria-label="Comment" content={doc} members={members} />
    </Card>
  );
}
