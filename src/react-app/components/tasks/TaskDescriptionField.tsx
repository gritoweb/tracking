import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { RichTextEditor } from "./RichTextEditor";
import { parseDescription } from "@/lib/richText";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";
import type { Task } from "@shared/schemas";
import type { JSONContent } from "@tiptap/react";

/** Past this, the description collapses behind a "Show more" — matching ClickUp's "Objetivo". */
const DESCRIPTION_COLLAPSED_HEIGHT = 180;

interface TaskDescriptionFieldProps {
  task: Task;
  members: WorkspaceMember[];
  onSave: (doc: JSONContent) => void;
  onUploadImage: (file: File) => Promise<{ url: string; id: string }>;
  onDeleteImage: (id: string) => void;
}

/**
 * Full when short, collapsed with a "Show more" when it overflows — never a fixed scroll box.
 * Keyed by task id from the caller, so switching tasks remounts it and `expanded` starts fresh.
 */
export function TaskDescriptionField({ task, members, onSave, onUploadImage, onDeleteImage }: TaskDescriptionFieldProps) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Wait for the content to actually paint before measuring it.
    const id = requestAnimationFrame(() => {
      const el = contentRef.current;
      if (el) setOverflowing(el.scrollHeight > DESCRIPTION_COLLAPSED_HEIGHT + 1);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    // Editing expands it: a caret or selection inside the clipped box would scroll it out from under the person.
    <div onFocusCapture={() => setExpanded(true)}>
      <div
        ref={contentRef}
        className="overflow-hidden"
        style={!expanded && overflowing ? { maxHeight: DESCRIPTION_COLLAPSED_HEIGHT } : undefined}
      >
        <RichTextEditor
          aria-label="Description"
          content={parseDescription(task.description)}
          onBlur={onSave}
          onUploadImage={onUploadImage}
          onDeleteImage={onDeleteImage}
          members={members}
          placeholder="Context, links, acceptance criteria — anything that isn't the name."
        />
      </div>
      {overflowing && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 text-muted-foreground"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      )}
    </div>
  );
}
