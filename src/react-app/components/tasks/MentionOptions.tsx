import { UserAvatar } from "@/components/layout/UserAvatar";
import { cn } from "@/lib/utils";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";

/** The list a "@" opens: who can be tagged, with the highlighted one for the keyboard. */
export function MentionOptions({
  items,
  active,
  onPick,
}: {
  items: WorkspaceMember[];
  active: number;
  onPick: (member: WorkspaceMember) => void;
}) {
  return (
    <ul role="listbox" aria-label="People to mention">
      {items.map((member, i) => (
        <li key={member.userId} role="option" aria-selected={i === active}>
          <button
            type="button"
            // mousedown, not click: the field must keep focus (and its caret) while a person is picked.
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(member);
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
  );
}
