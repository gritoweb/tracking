import { useEffect, useMemo, useRef, useState } from "react";
import { MentionChip } from "./MentionText";
import { MentionInput } from "./MentionInput";
import { splitPlainMentions } from "@shared/mentions";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";

interface TaskTitleProps {
  name: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
  members: WorkspaceMember[];
}

/**
 * The task's name. It is plain text, so a tagged person is only drawn as a chip while the field is not being
 * edited: click the text to edit it, click a chip to see the person. Plain text cannot say which of two people
 * with the same name was meant, so a repeated name resolves to the first; tag them in a comment for an exact tag.
 */
export function TaskTitle({ name, onNameChange, onSave, members }: TaskTitleProps) {
  const [editing, setEditing] = useState(false);
  const fieldRef = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members]);
  const segments = useMemo(
    () => splitPlainMentions(name, members.map((m) => ({ userId: m.userId, name: m.name }))),
    [name, members]
  );
  const hasChips = segments.some((s) => s.type === "mention");

  // Coming back from the chip view, the field opens with the caret at the end of the name.
  useEffect(() => {
    if (!editing) return;
    const el = fieldRef.current?.querySelector("textarea");
    if (el && document.activeElement !== el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);

  if (!editing && hasChips) {
    return (
      <div
        // Tab or a click on the words starts editing; a click on a chip only opens the profile.
        tabIndex={0}
        onFocus={(e) => e.target === e.currentTarget && setEditing(true)}
        onClick={(e) => !(e.target as HTMLElement).closest("button") && setEditing(true)}
        className="w-full cursor-text whitespace-pre-wrap break-words pb-px text-display font-semibold outline-none"
        aria-label="Task name"
      >
        {segments.map((segment, i) =>
          segment.type === "text" ? (
            <span key={i}>{segment.text}</span>
          ) : (
            <MentionChip key={i} member={byId.get(segment.userId)} fallback={segment.label} />
          )
        )}
      </div>
    );
  }

  return (
    <div ref={fieldRef}>
      <MentionInput
        variant="title"
        rows={1}
        members={members}
        value={name}
        onValueChange={onNameChange}
        onFocus={() => setEditing(true)}
        onBlur={() => {
          setEditing(false);
          onSave();
        }}
        onKeyDown={(e) => {
          // A name is one line that wraps: Enter confirms instead of adding a break.
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        aria-label="Task name"
      />
    </div>
  );
}
