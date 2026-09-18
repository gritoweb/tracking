import { useMemo, useRef, useState } from "react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { cn } from "@/lib/utils";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";

const MAX_SUGGESTIONS = 6;
const TRIGGER = /(^|\s)@([^\s@]*)$/;

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

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

  const matches = useMemo(() => {
    if (!trigger) return [];
    const q = fold(trigger.query);
    const seen = new Set<string>();
    return members
      .filter((m) => (fold(m.name).includes(q) || fold(m.email).includes(q)) && !seen.has(m.userId) && seen.add(m.userId))
      .slice(0, MAX_SUGGESTIONS);
  }, [members, trigger]);
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
        <ul role="listbox" aria-label="People to mention">
          {matches.map((member, i) => (
            <li key={member.userId} role="option" aria-selected={i === active}>
              <button
                type="button"
                // mousedown, not click: the field must keep focus (and its caret) while a person is picked.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(member);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                  i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                )}
              >
                <UserAvatar name={member.name} email={member.email} image={member.image} className="h-6 w-6" />
                <span className="min-w-0 flex-1 truncate">{member.name}</span>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
