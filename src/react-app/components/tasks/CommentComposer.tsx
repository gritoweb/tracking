import { useEffect, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { commentIsEmpty } from "@shared/comment-body";
import { attachmentIdsInDoc } from "@shared/rich-doc";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";
import { RichTextEditor } from "./RichTextEditor";
import type { InlineUpload } from "./editorUpload";

interface CommentComposerProps {
  /** The doc to start from: empty for a new comment, the comment's own for an edit. */
  initial: JSONContent;
  members: WorkspaceMember[];
  onUploadFile: (file: File) => Promise<InlineUpload>;
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
  onUploadFile,
  onDeleteImage,
  onSubmit,
  onCancel,
  submitLabel,
  placeholder,
  autoFocus,
}: CommentComposerProps) {
  const [doc, setDoc] = useState(initial);
  // Files added during this edit: Cancel throws the edit away, so they go with it.
  const added = useRef(new Set<string>());
  const upload = async (file: File) => {
    const uploaded = await onUploadFile(file);
    added.current.add(uploaded.id);
    return uploaded;
  };
  /** Deletes what this edit uploaded that the discarded text still shows (anything already taken out went on blur). */
  const discardAdded = (current: JSONContent) => {
    const kept = attachmentIdsInDoc(JSON.stringify(initial));
    const shown = attachmentIdsInDoc(JSON.stringify(current));
    for (const id of added.current) if (shown.has(id) && !kept.has(id)) onDeleteImage?.(id);
    added.current.clear();
  };
  const cancel = () => {
    discardAdded(doc);
    onCancel?.();
  };

  // A new comment closed without being posted (the task closed, another one opened) is thrown away with its files.
  const posted = useRef(false);
  const latest = useRef({ doc, discardAdded, isNew: !onCancel });
  useEffect(() => {
    latest.current = { doc, discardAdded, isNew: !onCancel };
  });
  useEffect(
    () => () => {
      if (latest.current.isNew && !posted.current) latest.current.discardAdded(latest.current.doc);
    },
    []
  );
  const empty = commentIsEmpty(JSON.stringify(doc));
  const submit = (current: JSONContent) => {
    const body = JSON.stringify(current);
    if (commentIsEmpty(body)) return;
    posted.current = true;
    onSubmit(body);
  };

  return (
    <RichTextEditor
      aria-label={onCancel ? "Edit comment" : "Write a comment"}
      content={initial}
      onChange={setDoc}
      onSubmit={submit}
      members={members}
      onUploadFile={upload}
      onDeleteImage={onDeleteImage}
      placeholder={placeholder}
      autoFocus={autoFocus}
      density="compact"
      // Big images or long text scroll inside the field; the toolbar and Send below it never leave the screen.
      className="min-h-(--size-composer-min) max-h-(--size-cap-40vh) overflow-y-auto"
      toolbar
      footer={
        <div className="flex items-center gap-1.5">
          {onCancel && (
            <Button type="button" variant="outline" size="xs" onClick={cancel}>
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
