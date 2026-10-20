import { useCallback, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { Paperclip, Send, Square, X } from "lucide-react";
import { formatFileSize } from "@shared/attachments";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * Auto-growing chat composer (fold.run ai-elements/prompt-input, trimmed to our
 * theme and deps — no model-selector). A form-wrapped Textarea that
 * grows with content via `field-sizing-content`, submits on Enter (Shift+Enter
 * for a newline, IME-composition safe), and an integrated send/stop button that
 * mirrors the turn state. Files come in by the clip button, a drop or a paste.
 */
export interface ComposerFile {
  key: string;
  name: string;
  size: number;
  uploading: boolean;
}

export function PromptInput({
  value,
  onChange,
  onSubmit,
  onStop,
  busy = false,
  status,
  placeholder = "Ask the assistant…",
  ariaLabel = "Message the Assistant",
  textareaRef,
  files = [],
  onAddFiles,
  onRemoveFile,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  onStop: () => void;
  busy?: boolean;
  /** Pending state before the first token — shows a spinner in the stop button. */
  status?: "ready" | "submitted" | "streaming" | "error";
  placeholder?: string;
  ariaLabel?: string;
  /** Lets the host focus the composer (e.g. when the panel opens). */
  textareaRef?: Ref<HTMLTextAreaElement>;
  files?: ComposerFile[];
  /** Omitted: the composer takes text only. */
  onAddFiles?: (files: File[]) => void;
  onRemoveFile?: (key: string) => void;
}) {
  const [isComposing, setIsComposing] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploading = files.some((f) => f.uploading);
  const canSend = value.trim().length > 0 && !busy && !uploading;

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text || busy || uploading) return;
    onSubmit(text);
  }, [value, busy, uploading, onSubmit]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key !== "Enter") return;
      // Let IME composition and Shift+Enter fall through to insert a newline.
      if (isComposing || e.nativeEvent.isComposing || e.shiftKey) return;
      e.preventDefault();
      submit();
    },
    [isComposing, submit]
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onDragOver={(e) => {
        if (!onAddFiles || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        if (!onAddFiles || !e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        onAddFiles([...e.dataTransfer.files]);
      }}
      className={cn(
        "flex flex-col gap-1.5 rounded-lg border bg-transparent p-1.5",
        dragging && "border-ring ring-[3px] ring-ring/50",
        // focus-within, not focus-visible: rings on the child Textarea's focus, and `focus-ring` has no such variant.
        "transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50"
      )}
    >
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-1.5 px-1 pt-1" aria-label="Attached files">
          {files.map((f) => (
            <li key={f.key} className="flex max-w-full items-center gap-1.5 rounded-full bg-muted py-0.5 pr-1 pl-2.5 text-xs">
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 text-muted-foreground">{formatFileSize(f.size)}</span>
              {f.uploading ? (
                <Spinner size="sm" />
              ) : (
                <Button type="button" size="icon-xs" variant="ghost" onClick={() => onRemoveFile?.(f.key)} aria-label={`Remove ${f.name}`} title="Remove">
                  <X className="h-3 w-3" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-end gap-2">
        {onAddFiles && (
          <>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="shrink-0"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Attach files"
              title="Attach files"
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files?.length) onAddFiles([...e.target.files]);
                e.target.value = "";
              }}
            />
          </>
        )}
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={() => setIsComposing(false)}
          onPaste={(e) => {
            if (!onAddFiles || !e.clipboardData.files.length) return;
            e.preventDefault();
            onAddFiles([...e.clipboardData.files]);
          }}
          placeholder={placeholder}
          aria-label={ariaLabel}
          rows={1}
          className="max-h-40 min-h-9 resize-none border-0 bg-transparent px-2 py-1.5 shadow-none focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
        />
        {busy ? (
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            className="shrink-0"
            onClick={onStop}
            aria-label="Stop"
            title="Stop"
          >
            {status === "submitted" ? (
              <Spinner />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </Button>
        ) : (
          <Button
            type="submit"
            size="icon-sm"
            className="shrink-0"
            disabled={!canSend}
            aria-label="Send message"
            title="Send"
          >
            <Send className="h-4 w-4" />
          </Button>
        )}
      </div>
    </form>
  );
}
