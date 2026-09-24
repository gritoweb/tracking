import { Expandable } from "@/components/ui/expandable";
import { RichTextEditor } from "./RichTextEditor";
import { useAuth } from "@/hooks/useAuth";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { useDescriptionCollab } from "@/hooks/useDescriptionCollab";
import { parseDescription } from "@/lib/richText";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";
import type { Task } from "@shared/schemas";
import type { JSONContent } from "@tiptap/react";

/** Past this, the description collapses behind "Expand" — matching ClickUp's task description. */
const DESCRIPTION_COLLAPSED_HEIGHT = 180;
/** `pt-6` above the text for a co-editor's name tag; added back so the collapsed text stays 180px tall. */
const NAME_TAG_GUTTER = 24;

interface TaskDescriptionFieldProps {
  task: Task;
  members: WorkspaceMember[];
  onSave: (doc: JSONContent) => void;
  onUploadImage: (file: File) => Promise<{ url: string; id: string }>;
  onDeleteImage: (id: string) => void;
}

/** Keyed by task id from the caller, so switching tasks remounts it and starts collapsed again. */
export function TaskDescriptionField({ task, members, onSave, onUploadImage, onDeleteImage }: TaskDescriptionFieldProps) {
  const { user } = useAuth();
  const { collabDescriptions } = useWorkspaceRole();
  const collab = useDescriptionCollab(task.id, collabDescriptions, user);
  return (
    // Gutters for what hangs outside the text (the "+ ⠿" handle, a co-editor's name tag) so the clip doesn't cut them.
    <Expandable
      collapsedHeight={DESCRIPTION_COLLAPSED_HEIGHT + NAME_TAG_GUTTER}
      expandOnFocus
      contentClassName="-ml-14 -mt-6 pl-14 pt-6">
      <RichTextEditor
        aria-label="Description"
        content={parseDescription(task.description)}
        onBlur={onSave}
        onUploadImage={onUploadImage}
        onDeleteImage={onDeleteImage}
        members={members}
        collab={collab}
        placeholder="Context, links, acceptance criteria — anything that isn't the name."
      />
    </Expandable>
  );
}
