import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { splitMentions } from "@shared/mentions";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };

/** "owner,admin" → the highest one, as a label. */
function roleLabel(role: string): string {
  const roles = role.split(",").map((r) => r.trim());
  const top = roles.includes("owner") ? "owner" : roles.includes("admin") ? "admin" : "member";
  return ROLE_LABEL[top];
}

function MentionChip({ member, fallback }: { member: WorkspaceMember | undefined; fallback: string }) {
  // A tag for someone who left, or a name we can't place, is just text: it must not look like a real person.
  if (!member) return <span className="text-muted-foreground">@{fallback}</span>;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="rounded-sm bg-primary/10 px-1 font-medium text-primary-ink transition-colors duration-fast ease-out-quart hover:bg-primary/20 focus-ring"
        >
          @{member.name}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64">
        <div className="flex items-center gap-3">
          <UserAvatar name={member.name} email={member.email} image={member.image} className="h-10 w-10" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{member.name}</p>
            {member.email && <p className="truncate text-xs text-muted-foreground">{member.email}</p>}
            <p className="text-xs text-muted-foreground">{roleLabel(member.role)}</p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** A stored body with its @[Name](user:ID) tags drawn as chips. The name shown is the member's own, never what the tag says. */
export function MentionText({ body, members }: { body: string; members: WorkspaceMember[] }) {
  const byId = new Map(members.map((m) => [m.userId, m]));
  return (
    <p className="whitespace-pre-wrap text-sm">
      {splitMentions(body).map((segment, i) =>
        segment.type === "text" ? (
          <span key={i}>{segment.text}</span>
        ) : (
          <MentionChip key={i} member={byId.get(segment.userId)} fallback={segment.label} />
        )
      )}
    </p>
  );
}
