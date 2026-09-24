import { useState } from "react";
import { Mention, type MentionNodeAttrs } from "@tiptap/extension-mention";
import type { Editor } from "@tiptap/react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { MemberProfile } from "./MemberProfile";
import { MentionOptions } from "./MentionOptions";
import { useSuggestionMenu } from "./useSuggestionMenu";
import { filterMembers } from "@/lib/mentionSearch";
import { anchorAt } from "@/lib/caret";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";

declare module "@tiptap/core" {
  interface Storage {
    mention: { members: WorkspaceMember[] };
  }
}

/** Hands the editor the current team, which "@" lists; call it whenever the team changes. */
export function setMentionMembers(editor: Editor, members: WorkspaceMember[]) {
  editor.storage.mention.members = members;
}

/** "@" inside the description editor: the extension, the list beside the caret and the profile a chip opens. */
export function useEditorMentions(members: WorkspaceMember[]) {
  const menu = useSuggestionMenu<WorkspaceMember>();
  const [profile, setProfile] = useState<{ userId: string; rect: DOMRect } | null>(null);

  // Created once: tiptap keeps an extension's config for the editor's whole life. The team lives in the
  // extension's storage (see `setMentionMembers`), so the list is always read fresh from the editor.
  const [extension] = useState(() =>
    Mention.extend({
      addStorage: () => ({ members: [] as WorkspaceMember[] }),
    }).configure({
      HTMLAttributes: { class: "tt-mention" },
      suggestion: {
        char: "@",
        items: ({ query, editor }) => filterMembers(editor.storage.mention.members, query),
        render: menu.render<MentionNodeAttrs>((props) => (member) =>
          props.command({ id: member.userId, label: member.name })
        ),
      },
    })
  );

  /** For the editor's click handler: a click on a chip opens that person's profile. */
  const onChipClick = (event: MouseEvent) => {
    const chip = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-type="mention"]');
    const userId = chip?.getAttribute("data-id");
    if (chip && userId) setProfile({ userId, rect: chip.getBoundingClientRect() });
  };

  const profileMember = profile ? members.find((m) => m.userId === profile.userId) : undefined;

  const ui = (
    <>
      {menu.popover((items, active) => (
        <MentionOptions items={items} active={active} onPick={menu.choose} />
      ))}
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
