import { useMemo, useRef, useState } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { MentionOptions } from "./MentionOptions";
import { filterMembers } from "@/lib/mentionSearch";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";

const TRIGGER = /(^|\s)@([^\s@]*)$/;

interface Trigger {
  start: number;
  query: string;
}

type MentionInputProps = Omit<React.ComponentProps<typeof Textarea>, "value" | "onChange"> & {
  value: string;
  onValueChange: (value: string) => void;
  members: WorkspaceMember[];
  /** Who was chosen from the list: the only way to tell two people with one name apart. */
  onPick?: (member: WorkspaceMember) => void;
};

/** A textarea where typing "@" lists the team next to the text and picking one writes "@Name" in it. */
export function MentionInput({ value, onValueChange, members, onPick, onKeyDown, ...props }: MentionInputProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [trigger, setTrigger] = useState<Trigger | null>(null);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => (trigger ? filterMembers(members, trigger.query) : []), [members, trigger]);
  const open = trigger !== null && matches.length > 0;

  const readTrigger = (text: string, caret: number) => {
    const found = TRIGGER.exec(text.slice(0, caret));
    return found ? { start: caret - found[2].length - 1, query: found[2] } : null;
  };

  const pick = (member: WorkspaceMember) => {
    if (!trigger || !ref.current) return;
    const caret = ref.current.selectionStart;
    const before = value.slice(0, trigger.start);
    const inserted = `@${member.name} `;
    onValueChange(`${before}${inserted}${value.slice(caret)}`);
    onPick?.(member);
    setTrigger(null);
    const el = ref.current;
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = before.length + inserted.length;
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (open) {
      const plainEnter = e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.shiftKey;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + matches.length) % matches.length);
        return;
      }
      if (plainEnter || e.key === "Tab") {
        e.preventDefault();
        pick(matches[active] ?? matches[0]);
        return;
      }
      if (e.key === "Escape") {
        // Only the list closes: the panel around the field must stay open.
        e.preventDefault();
        e.stopPropagation();
        setTrigger(null);
        return;
      }
    }
    onKeyDown?.(e);
  };

  return (
    <Popover open={open} onOpenChange={(next) => !next && setTrigger(null)}>
      <PopoverAnchor asChild>
        <div>
          <Textarea
            {...props}
            ref={ref}
            value={value}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-haspopup="listbox"
            onChange={(e) => {
              onValueChange(e.target.value);
              setTrigger(readTrigger(e.target.value, e.target.selectionStart));
              setActive(0);
            }}
            onSelect={(e) => setTrigger(readTrigger(e.currentTarget.value, e.currentTarget.selectionStart))}
            onKeyDown={handleKeyDown}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-64 p-1"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <MentionOptions items={matches} active={active} onPick={pick} />
      </PopoverContent>
    </Popover>
  );
}
