import { useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { AtSign, Pencil, Send, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { MultiSelect } from "@/components/pickers/MultiSelect";
import {
  useCreateTaskComment,
  useDeleteTaskComment,
  useTaskComments,
  useUpdateTaskComment,
} from "@/hooks/useTaskComments";
import { useUploadTaskAttachment } from "@/hooks/useTasks";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import type { TaskComment } from "@shared/schemas";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

function imageFile(items: DataTransferItemList | FileList | null | undefined): File | null {
  if (!items) return null;
  for (const item of items) {
    const file = "getAsFile" in item ? item.getAsFile() : (item as File);
    if (file?.type.startsWith("image/")) return file;
  }
  return null;
}

interface Member {
  userId: string;
  name: string;
  image: string | null;
}

/** A pending or already-sent image — a small thumbnail with an X to drop it before/after posting. */
function AttachmentPreview({
  url,
  filename,
  onRemove,
}: {
  url: string;
  filename?: string | null;
  onRemove?: () => void;
}) {
  return (
    <div className="relative inline-block h-16 w-16">
      <img src={url} alt={filename ?? "Attachment"} className="h-16 w-16 rounded-md border object-cover" />
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove image"
          className="absolute -right-1.5 -top-1.5 rounded-full bg-background p-0.5 text-muted-foreground shadow-sm hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/** One comment row, or its own edit form when the author is editing it in place. */
function CommentRow({
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
            onDrop={(e) => { e.preventDefault(); attach(imageFile(e.dataTransfer?.files)); }}
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

/** Who gets @mentioned — typing "@" opens the same picker a click on the pill would. */
function MentionPicker({
  members,
  value,
  onChange,
  open,
  onOpenChange,
}: {
  members: Member[];
  value: string[];
  onChange: (ids: string[]) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <MultiSelect
        label="Mention"
        options={members.map((m) => ({ value: m.userId, label: m.name, image: m.image }))}
        value={value}
        onChange={onChange}
        open={open}
        onOpenChange={onOpenChange}
        trigger={
          <button
            type="button"
            aria-label="Mention someone"
            className="flex h-6 items-center gap-1 rounded-full border border-dashed px-2 text-micro text-muted-foreground hover:border-muted-foreground hover:text-foreground"
          >
            <AtSign className="h-3 w-3" />
            Mention
          </button>
        }
      />
      {value.map((id) => {
        const member = members.find((m) => m.userId === id);
        if (!member) return null;
        return (
          <span
            key={id}
            className="flex items-center gap-1 rounded-full bg-muted py-0.5 pl-2 pr-1 text-micro"
          >
            {member.name}
            <button
              type="button"
              aria-label={`Remove ${member.name}`}
              onClick={() => onChange(value.filter((x) => x !== id))}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        );
      })}
    </div>
  );
}

/** Flat, single-level comments on one task — no reply/thread, same as a WhatsApp group chat. */
export function TaskComments({ taskId, members }: { taskId: string; members: Member[] }) {
  const { user } = useAuth();
  const { data: comments = [] } = useTaskComments(taskId);
  const createComment = useCreateTaskComment(taskId);
  const updateComment = useUpdateTaskComment(taskId);
  const deleteComment = useDeleteTaskComment(taskId);
  const uploadAttachment = useUploadTaskAttachment();

  const [body, setBody] = useState("");
  const [mentioned, setMentioned] = useState<string[]>([]);
  const [attachment, setAttachment] = useState<{ id: string; url: string } | null>(null);
  const [mentionOpen, setMentionOpen] = useState(false);

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

  const submit = () => {
    if (!body.trim()) return;
    createComment.mutate(
      { body: body.trim(), mentionedUserIds: mentioned, attachmentId: attachment?.id ?? null },
      { onSuccess: () => { setBody(""); setMentioned([]); setAttachment(null); } }
    );
  };

  return (
    <div className="space-y-2">
      {comments.length > 0 && (
        <div className="divide-y rounded-md border">
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              taskId={taskId}
              members={members}
              isAuthor={c.userId === user?.id}
              onDelete={() => deleteComment.mutate(c.id)}
              onSave={(nextBody, nextMentioned, nextAttachmentId) =>
                updateComment.mutate({
                  id: c.id,
                  data: { body: nextBody, mentionedUserIds: nextMentioned, attachmentId: nextAttachmentId },
                })
              }
            />
          ))}
        </div>
      )}

      <div className={cn("space-y-1.5 rounded-md border p-2", comments.length === 0 && "border-dashed")}>
        <Textarea
          value={body}
          onChange={(e) => handleBodyChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
          onPaste={(e) => attach(imageFile(e.clipboardData?.items))}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); attach(imageFile(e.dataTransfer?.files)); }}
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
          <Button size="sm" className="gap-1.5" disabled={!body.trim() || createComment.isPending} onClick={submit}>
            <Send className="h-3.5 w-3.5" />
            Comment
          </Button>
        </div>
      </div>
    </div>
  );
}
