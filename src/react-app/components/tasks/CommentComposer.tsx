import { useState } from "react";
import type { JSONContent } from "@tiptap/react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { commentIsEmpty } from "@shared/comment-body";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";
import { RichTextEditor } from "./RichTextEditor";

interface CommentComposerProps {
  /** The doc to start from: empty for a new comment, the comment's own for an edit. */
  initial: JSONContent;
  members: WorkspaceMember[];
  onUploadImage: (file: File) => Promise<{ url: string; id: string }>;
  onDeleteImage?: (id: string) => void;
  /** Receives the stored body (the doc as JSON); the caller decides what happens next. */
  onSubmit: (body: string) => void;
  /** An edit can be abandoned; a new comment just stays as a draft. */
  onCancel?: () => void;
  submitLabel: string;
  placeholder?: string;
  autoFocus?: boolean;
}

/** Writes or edits a comment with the description's editor: the same blocks, "/", "@", images and formatting. */
export function CommentComposer({
  initial,
  members,
  onUploadImage,
  onDeleteImage,
  onSubmit,
  onCancel,
  submitLabel,
  placeholder,
  autoFocus,
}: CommentComposerProps) {
  const [doc, setDoc] = useState(initial);
  const empty = commentIsEmpty(JSON.stringify(doc));
  const submit = (current: JSONContent) => {
    const body = JSON.stringify(current);
    if (!commentIsEmpty(body)) onSubmit(body);
  };

  return (
    <RichTextEditor
      aria-label={onCancel ? "Edit comment" : "Write a comment"}
      content={initial}
      onChange={setDoc}
      onSubmit={submit}
      members={members}
      onUploadImage={onUploadImage}
      onDeleteImage={onDeleteImage}
      placeholder={placeholder}
      autoFocus={autoFocus}
      density="compact"
      toolbar
      footer={
        <div className="flex items-center gap-1.5">
          {onCancel && (
            <Button type="button" variant="outline" size="xs" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button type="button" size="xs" className="gap-1.5" disabled={empty} onClick={() => submit(doc)}>
            {!onCancel && <Send className="size-3" />}
            {submitLabel}
          </Button>
        </div>
      }
    />
  );
}
