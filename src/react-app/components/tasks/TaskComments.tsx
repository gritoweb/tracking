import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AttachmentPreview } from "./TaskCommentAttachment";
import { CommentRow } from "./TaskCommentRow";
import { TaskActivityRow } from "./TaskActivityRow";
import { MentionPicker } from "./TaskCommentMentionPicker";
import {
  PENDING_COMMENT_PREFIX,
  useCreateTaskComment,
  useDeleteTaskComment,
  useTaskActivity,
  useTaskComments,
  useUpdateTaskComment,
} from "@/hooks/useTaskComments";
import { useUploadTaskAttachment } from "@/hooks/useTasks";
import { ACCEPTED_TYPES, MAX_ATTACHMENT_BYTES, imageFile } from "@/lib/taskCommentAttachments";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import type { TaskComment } from "@shared/schemas";

export interface Member {
  userId: string;
  name: string;
  image: string | null;
}

/** Flat, single-level comments on one task — no reply/thread, same as a WhatsApp group chat. */
export function TaskComments({ taskId, members }: { taskId: string; members: Member[] }) {
  const { user } = useAuth();
  const { data: comments = [] } = useTaskComments(taskId);
  const { data: activity = [] } = useTaskActivity(taskId);
  // One timeline: comments and changes, oldest first. ISO strings sort by time.
  const feed = useMemo(
    () =>
      [
        ...comments.map((comment) => ({ at: comment.createdAt, comment })),
        ...activity.map((entry) => ({ at: entry.createdAt, entry })),
      ].sort((a, b) => a.at.localeCompare(b.at)),
    [comments, activity]
  );
  const createComment = useCreateTaskComment(taskId);
  const updateComment = useUpdateTaskComment(taskId);
  const deleteComment = useDeleteTaskComment(taskId);
  const uploadAttachment = useUploadTaskAttachment();

  const [body, setBody] = useState("");
  const [mentioned, setMentioned] = useState<string[]>([]);
  const [attachment, setAttachment] = useState<{ id: string; url: string } | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  // Deleting a comment has no undo toast, so it goes through ConfirmDialog first.
  const [pendingDelete, setPendingDelete] = useState<TaskComment | null>(null);

  // Typing "@" opens the picker directly — no separate click needed. The "@" itself
  // never lands in the message; who's mentioned is tracked by id, not by text.
  const handleBodyChange = (next: string) => {
    setBody(next);
    if (next.endsWith("@") && /(?:^|\s)@$/.test(next)) setMentionOpen(true);
  };

  const attach = async (file: File | null) => {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) return toast.error("Only PNG, JPEG, WebP and GIF images are accepted");
    if (file.size > MAX_ATTACHMENT_BYTES) return toast.error("Image is larger than 10 MB");
    const uploaded = await uploadAttachment.mutateAsync({ taskId, file });
    setAttachment({ id: uploaded.id, url: uploaded.url });
  };

  // The composer clears at once (the comment is already on screen); a failure puts the text back.
  const submit = () => {
    const text = body.trim();
    if (!text) return;
    const sent = { mentioned, attachment };
    setBody("");
    setMentioned([]);
    setAttachment(null);
    createComment.mutate(
      {
        body: text,
        mentionedUserIds: sent.mentioned,
        attachmentId: sent.attachment?.id ?? null,
        attachmentUrl: sent.attachment?.url ?? null,
      },
      {
        onError: (error) => {
          toast.error(error.message || "Failed to post comment");
          setBody((current) => current || text);
          setMentioned((current) => (current.length ? current : sent.mentioned));
          setAttachment((current) => current ?? sent.attachment);
        },
      }
    );
  };

  return (
    <div className="space-y-2">
      {feed.length > 0 && (
        <div className="divide-y rounded-md border">
          {feed.map((item) =>
            "comment" in item ? (
              <CommentRow
                key={item.comment.id}
                comment={item.comment}
                taskId={taskId}
                members={members}
                isAuthor={item.comment.userId === user?.id && !item.comment.id.startsWith(PENDING_COMMENT_PREFIX)}
                onDelete={() => setPendingDelete(item.comment)}
                onSave={(nextBody, nextMentioned, nextAttachmentId) =>
                  updateComment.mutate({
                    id: item.comment.id,
                    data: { body: nextBody, mentionedUserIds: nextMentioned, attachmentId: nextAttachmentId },
                  })
                }
              />
            ) : (
              <TaskActivityRow key={item.entry.id} activity={item.entry} />
            )
          )}
        </div>
      )}

      <div className={cn("space-y-1.5 rounded-md border p-2", feed.length === 0 && "border-dashed")}>
        <Textarea
          value={body}
          onChange={(e) => handleBodyChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          onPaste={(e) => attach(imageFile(e.clipboardData?.items))}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            attach(imageFile(e.dataTransfer?.files));
          }}
          placeholder="Write a comment… @ to mention someone, paste or drop an image to attach it"
          rows={2}
        />
        {attachment && <AttachmentPreview url={attachment.url} onRemove={() => setAttachment(null)} />}
        <div className="flex items-center justify-between">
          <MentionPicker
            members={members}
            value={mentioned}
            onChange={(next) => {
              // Picked via "@" — drop the trailing "@" now that the mention is tracked by id.
              if (mentionOpen && next.length > mentioned.length && body.endsWith("@")) {
                setBody(body.slice(0, -1));
              }
              setMentioned(next);
            }}
            open={mentionOpen}
            onOpenChange={setMentionOpen}
          />
          <Button size="sm" className="gap-1.5" disabled={!body.trim()} onClick={submit}>
            <Send className="h-3.5 w-3.5" />
            Comment
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
        title="Delete this comment?"
        description="This can't be undone."
        onConfirm={() => {
          if (pendingDelete) deleteComment.mutate(pendingDelete.id);
          setPendingDelete(null);
        }}
      />
    </div>
  );
}
