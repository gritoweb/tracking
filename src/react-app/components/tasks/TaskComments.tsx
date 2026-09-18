import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AttachmentPreview } from "./TaskCommentAttachment";
import { CommentRow } from "./TaskCommentRow";
import { TaskActivityRow } from "./TaskActivityRow";
import { MentionInput } from "./MentionInput";
import {
  PENDING_COMMENT_PREFIX,
  useCreateTaskComment,
  useDeleteTaskComment,
  useTaskActivity,
  useTaskComments,
  useUpdateTaskComment,
} from "@/hooks/useTaskComments";
import { useUploadTaskAttachment } from "@/hooks/useTasks";
import { imageFile, imageProblem } from "@/lib/taskCommentAttachments";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { encodeMentions, type MentionPerson } from "@shared/mentions";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";
import { TASK_COMMENTS_PAGE_SIZE, type TaskComment } from "@shared/schemas";

/** Flat, single-level comments on one task — no reply/thread, same as a WhatsApp group chat. */
export function TaskComments({ taskId, members }: { taskId: string; members: WorkspaceMember[] }) {
  const { user } = useAuth();
  const { canManage } = useWorkspaceRole();
  // A full page means there may be older comments; each click asks for one more page.
  const [limit, setLimit] = useState(TASK_COMMENTS_PAGE_SIZE);
  const { data: comments = [], isFetching } = useTaskComments(taskId, limit);
  const mayHaveOlder = comments.length >= limit;
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
  const [picked, setPicked] = useState<MentionPerson[]>([]);
  const [attachment, setAttachment] = useState<{ id: string; url: string } | null>(null);
  // Deleting a comment has no undo toast, so it goes through ConfirmDialog first.
  const [pendingDelete, setPendingDelete] = useState<TaskComment | null>(null);

  const attach = async (file: File | null) => {
    if (!file) return;
    const problem = imageProblem(file);
    if (problem) return toast.error(problem);
    const uploaded = await uploadAttachment.mutateAsync({ taskId, file });
    setAttachment({ id: uploaded.id, url: uploaded.url });
  };

  // The composer clears at once (the comment is already on screen); a failure puts the text back.
  const submit = () => {
    const text = body.trim();
    if (!text) return;
    const sent = { attachment, picked };
    setBody("");
    setPicked([]);
    setAttachment(null);
    createComment.mutate(
      {
        // "@Name" typed or picked becomes a tag; the server reads who is mentioned from the text.
        body: encodeMentions(text, [...sent.picked, ...members]),
        attachmentId: sent.attachment?.id ?? null,
        attachmentUrl: sent.attachment?.url ?? null,
      },
      {
        onError: (error) => {
          toast.error(error.message || "Failed to post comment");
          setBody((current) => current || text);
          setPicked((current) => (current.length ? current : sent.picked));
          setAttachment((current) => current ?? sent.attachment);
        },
      }
    );
  };

  return (
    <div className="space-y-2">
      {/* Two things, kept apart: the conversation in its frame, and below it, with a gap, the field in a frame of its own. */}
      <div className="space-y-4">
        {feed.length > 0 && (
          <div className="divide-y rounded-md border">
            {mayHaveOlder && (
              <div className="flex justify-center p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isFetching}
                  onClick={() => setLimit((current) => current + TASK_COMMENTS_PAGE_SIZE)}
                >
                  Load earlier comments
                </Button>
              </div>
            )}
            {feed.map((item) =>
            "comment" in item ? (
              <CommentRow
                key={item.comment.id}
                comment={item.comment}
                taskId={taskId}
                members={members}
                isAuthor={item.comment.userId === user?.id && !item.comment.id.startsWith(PENDING_COMMENT_PREFIX)}
                canDelete={
                  !item.comment.id.startsWith(PENDING_COMMENT_PREFIX) && (canManage || item.comment.userId === user?.id)
                }
                onDelete={() => setPendingDelete(item.comment)}
                onSave={(nextBody, nextAttachmentId) =>
                  updateComment.mutate({
                    id: item.comment.id,
                    data: { body: nextBody, attachmentId: nextAttachmentId },
                  })
                }
              />
            ) : (
              <TaskActivityRow key={item.entry.id} activity={item.entry} />
            )
            )}
          </div>
        )}

        <div className="space-y-2 rounded-md border px-4 py-3">
          <MentionInput
            variant="bare"
            value={body}
            onValueChange={setBody}
            members={members}
            onPick={(member) => setPicked((list) => [...list, { userId: member.userId, name: member.name }])}
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
          />
          {attachment && <AttachmentPreview url={attachment.url} onRemove={() => setAttachment(null)} />}
          <div className="flex items-center justify-end">
            <Button size="sm" className="gap-1.5" disabled={!body.trim()} onClick={submit}>
              <Send className="h-3.5 w-3.5" />
              Comment
            </Button>
          </div>
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
