import { useEffect, useMemo, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Card } from "@/components/ui/card";
import { CommentComposer } from "./CommentComposer";
import { useTaskImageUpload } from "@/hooks/useTaskImageUpload";
import { EMPTY_DOC } from "@/lib/richText";
import { CommentRow } from "./TaskCommentRow";
import { TaskActivityRow } from "./TaskActivityRow";
import {
  PENDING_COMMENT_PREFIX,
  useCreateTaskComment,
  useDeleteTaskComment,
  useTaskActivity,
  useTaskComments,
  useUpdateTaskComment,
} from "@/hooks/useTaskComments";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";
import { TASK_COMMENTS_PAGE_SIZE, type TaskComment } from "@shared/schemas";
import { cn } from "@/lib/utils";

interface TaskCommentsProps {
  taskId: string;
  members: WorkspaceMember[];
  /** Fill the parent's height: the feed scrolls and the composer stays pinned below it (the modal's column). */
  docked?: boolean;
}

/** Flat, single-level comments on one task — no reply/thread, same as a WhatsApp group chat. */
export function TaskComments({ taskId, members, docked = false }: TaskCommentsProps) {
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
  const feedRef = useRef<HTMLDivElement>(null);
  // Docked, the newest item sits at the bottom of a scroll box — keep it in view as the feed grows.
  useEffect(() => {
    if (docked && feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [docked, feed.length]);
  const createComment = useCreateTaskComment(taskId);
  const updateComment = useUpdateTaskComment(taskId);
  const deleteComment = useDeleteTaskComment(taskId);
  const { uploadImage, deleteOrphanedImage } = useTaskImageUpload(taskId);
  // A new key mounts a fresh composer: cleared after a send, or holding the text again if the send failed.
  const [composer, setComposer] = useState<{ key: number; initial: JSONContent }>({ key: 0, initial: EMPTY_DOC });
  // Deleting a comment has no undo toast, so it goes through ConfirmDialog first.
  const [pendingDelete, setPendingDelete] = useState<TaskComment | null>(null);

  // The composer clears at once (the comment is already on screen); a failure puts the text back.
  const submit = (body: string) => {
    setComposer((c) => ({ key: c.key + 1, initial: EMPTY_DOC }));
    createComment.mutate(
      // The server reads who is mentioned from the doc itself.
      { body, attachmentId: null, attachmentUrl: null },
      {
        onError: (error) => {
          toast.error(error.message || "Failed to post comment");
          setComposer((c) => ({ key: c.key + 1, initial: JSON.parse(body) as JSONContent }));
        },
      }
    );
  };

  return (
    <div className={cn(docked ? "flex min-h-0 flex-1 flex-col" : "space-y-2")}>
      {/* Two things, kept apart: the conversation in its frame, and below it, with a gap, the field in a frame of its own. */}
      <div className={cn(docked ? "flex min-h-0 flex-1 flex-col gap-4" : "space-y-4")}>
        {/* Each comment is its own card; the feed is only the stack that scrolls them. */}
        {feed.length > 0 && (
          <div ref={feedRef} className={cn("flex flex-col gap-3", docked && "min-h-0 flex-1 overflow-y-auto")}>
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

        {/* The same card as a comment: what you write already looks like what it becomes. */}
        <Card size="compact" look="outlined" className={cn(docked && "mt-auto shrink-0")}>
          <CommentComposer
            key={composer.key}
            initial={composer.initial}
            members={members}
            onUploadImage={uploadImage}
            onDeleteImage={deleteOrphanedImage}
            onSubmit={submit}
            submitLabel="Comment"
            placeholder="Write a comment… type / for blocks, @ to mention someone"
          />
        </Card>
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
