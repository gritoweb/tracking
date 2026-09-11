import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authClient } from "@/lib/auth-client";
import { useAuth } from "@/hooks/useAuth";

export function WorkspaceSwitcher({ collapsed }: { collapsed?: boolean }) {
  const { data: orgs } = authClient.useListOrganizations();
  const { session } = useAuth();
  const activeId = session?.activeOrganizationId ?? orgs?.[0]?.id;

  if (!orgs || orgs.length < 2) return null;

  const handleChange = async (organizationId: string) => {
    await authClient.organization.setActive({ organizationId });
    await authClient.getSession({ query: { disableCookieCache: true } });
    window.location.reload();
  };

  return (
    <Select value={activeId} onValueChange={handleChange}>
      <SelectTrigger
        size="sm"
        className={collapsed ? "h-8 w-8 justify-center p-0 [&>svg]:hidden" : "h-8 text-xs"}
        aria-label="Switch workspace"
      >
        {collapsed ? "W" : <SelectValue />}
      </SelectTrigger>
      <SelectContent>
        {orgs.map((org) => (
          <SelectItem key={org.id} value={org.id}>
            {org.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
