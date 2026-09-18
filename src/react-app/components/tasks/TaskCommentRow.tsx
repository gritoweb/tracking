import { useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { AttachmentPreview } from "./TaskCommentAttachment";
import { MentionInput } from "./MentionInput";
import { MentionText } from "./MentionText";
import { useUploadTaskAttachment } from "@/hooks/useTasks";
import { imageFile, imageProblem } from "@/lib/taskCommentAttachments";
import { decodeMentions, encodeMentions, taggedPeople, type MentionPerson } from "@shared/mentions";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";
import type { TaskComment } from "@shared/schemas";

/** One comment row, or its own edit form when the author is editing it in place. */
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
  const uploadAttachment = useUploadTaskAttachment();
  const [editing, setEditing] = useState(false);
  // Edited as "@Name" text; the tags come back on save.
  const [body, setBody] = useState(() => decodeMentions(comment.body, members));
  const [picked, setPicked] = useState<MentionPerson[]>(() => taggedPeople(comment.body, members));
  const [attachment, setAttachment] = useState<{ id: string; url: string } | null>(
    comment.attachmentId && comment.attachmentUrl ? { id: comment.attachmentId, url: comment.attachmentUrl } : null
  );

  const attach = async (file: File | null) => {
    if (!file) return;
    const problem = imageProblem(file);
    if (problem) return toast.error(problem);
    const uploaded = await uploadAttachment.mutateAsync({ taskId, file });
    setAttachment({ id: uploaded.id, url: uploaded.url });
  };

  if (editing) {
    return (
      <div className="flex gap-2.5 px-3 py-2.5">
        <UserAvatar name={comment.userName} image={comment.userImage} className="h-7 w-7 shrink-0" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <MentionInput
            aria-label="Edit comment"
            value={body}
            onValueChange={setBody}
            members={members}
            onPick={(member) => setPicked((list) => [...list, { userId: member.userId, name: member.name }])}
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
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!body.trim()}
              onClick={() => {
                onSave(encodeMentions(body.trim(), [...picked, ...members]), attachment?.id ?? null);
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
        <MentionText body={comment.body} members={members} />
      </div>
      {(isAuthor || canDelete) && (
        <div className="tt-reveal flex shrink-0 items-start gap-0.5">
          {isAuthor && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Edit comment"
              onClick={() => {
                // Members may have loaded since this row mounted, so decode when editing starts.
                setBody(decodeMentions(comment.body, members));
                setPicked(taggedPeople(comment.body, members));
                setEditing(true);
              }}
            >
              <Pencil className="h-3 w-3" />
            </Button>
          )}
          {canDelete && (
            <Button variant="ghost" size="icon-xs" aria-label="Delete comment" onClick={onDelete}>
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
