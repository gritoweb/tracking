import { useEffect, useMemo, useRef, useState } from "react";
import { Mention, type MentionNodeAttrs } from "@tiptap/extension-mention";
import type { SuggestionProps } from "@tiptap/suggestion";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { MemberProfile } from "./MemberProfile";
import { MentionOptions } from "./MentionOptions";
import { filterMembers } from "@/lib/mentionSearch";
import { anchorAt } from "@/lib/caret";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";

interface Suggest {
  items: WorkspaceMember[];
  rect: DOMRect | null;
  index: number;
  command: (attrs: MentionNodeAttrs) => void;
}

/** "@" inside the description editor: the extension, the list beside the caret and the profile a chip opens. */
export function useEditorMentions(members: WorkspaceMember[]) {
  const membersRef = useRef(members);
  useEffect(() => {
    membersRef.current = members;
  }, [members]);

  const [suggest, setSuggestState] = useState<Suggest | null>(null);
  // The keyboard handler lives in tiptap and outlasts renders, so it reads the current list from a ref.
  const suggestRef = useRef<Suggest | null>(null);
  const [profile, setProfile] = useState<{ userId: string; rect: DOMRect } | null>(null);

  const setSuggest = (next: Suggest | null) => {
    suggestRef.current = next;
    setSuggestState(next);
  };

  const pickAt = (s: Suggest, member: WorkspaceMember) => {
    s.command({ id: member.userId, label: member.name });
    setSuggest(null);
  };

  const extension = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs -- tiptap keeps these callbacks for the editor's life, so they read live values through refs
      Mention.configure({
        HTMLAttributes: { class: "tt-mention" },
        suggestion: {
          char: "@",
          items: ({ query }) => filterMembers(membersRef.current, query),
          render: () => {
            const show = (props: SuggestionProps<WorkspaceMember, MentionNodeAttrs>) =>
              setSuggest({ items: props.items, rect: props.clientRect?.() ?? null, index: 0, command: props.command });
            return {
              onStart: show,
              onUpdate: show,
              onKeyDown: ({ event }) => {
                const s = suggestRef.current;
                if (!s || s.items.length === 0) return false;
                if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                  const step = event.key === "ArrowDown" ? 1 : -1;
                  setSuggest({ ...s, index: (s.index + step + s.items.length) % s.items.length });
                  return true;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  pickAt(s, s.items[s.index]);
                  return true;
                }
                if (event.key === "Escape") {
                  setSuggest(null);
                  return true;
                }
                return false;
              },
              onExit: () => setSuggest(null),
            };
          },
        },
      }),
    // Built once: tiptap keeps this config for the life of the editor, and it reads the team from a ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** For the editor's click handler: a click on a chip opens that person's profile. */
  const onChipClick = (event: MouseEvent) => {
    const chip = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-type="mention"]');
    const userId = chip?.getAttribute("data-id");
    if (chip && userId) setProfile({ userId, rect: chip.getBoundingClientRect() });
  };

  const profileMember = profile ? members.find((m) => m.userId === profile.userId) : undefined;
  const open = suggest !== null && suggest.items.length > 0;

  const ui = (
    <>
      <Popover open={open} onOpenChange={(next) => !next && setSuggest(null)}>
        <PopoverAnchor virtualRef={anchorAt(suggest?.rect ?? null)} />
        <PopoverContent
          align="start"
          className="w-64 p-1"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          {suggest && (
            <MentionOptions items={suggest.items} active={suggest.index} onPick={(member) => pickAt(suggest, member)} />
          )}
        </PopoverContent>
      </Popover>
      <Popover open={Boolean(profileMember)} onOpenChange={(next) => !next && setProfile(null)}>
        <PopoverAnchor virtualRef={anchorAt(profile?.rect ?? null)} />
        <PopoverContent align="start" className="w-64">
          {profileMember && <MemberProfile member={profileMember} />}
        </PopoverContent>
      </Popover>
    </>
  );

  return { extension, onChipClick, ui };
}
