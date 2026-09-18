import { UserAvatar } from "@/components/layout/UserAvatar";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";

const ROLE_LABEL: Record<string, string> = { owner: "Owner", admin: "Admin", member: "Member" };

/** "owner,admin" → the highest one, as a label. */
function roleLabel(role: string): string {
  const roles = role.split(",").map((r) => r.trim());
  const top = roles.includes("owner") ? "owner" : roles.includes("admin") ? "admin" : "member";
  return ROLE_LABEL[top];
}

/** What a tagged name opens: who the person is, wherever the tag was written. */
export function MemberProfile({ member }: { member: WorkspaceMember }) {
  return (
    <div className="flex items-center gap-3">
      <UserAvatar name={member.name} email={member.email} image={member.image} className="h-10 w-10" />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{member.name}</p>
        {member.email && <p className="truncate text-xs text-muted-foreground">{member.email}</p>}
        <p className="text-xs text-muted-foreground">{roleLabel(member.role)}</p>
      </div>
    </div>
  );
}
