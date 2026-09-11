import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { authClient } from "@/lib/auth-client";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

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
        className={cn(
          "w-full rounded-md border bg-background text-sm text-muted-foreground transition-colors duration-fast ease-out-quart hover:bg-accent hover:text-foreground",
          collapsed ? "justify-center p-2" : "gap-2 px-2.5 py-1.5"
        )}
        aria-label="Switch workspace"
      >
        {collapsed ? "W" : <SelectValue />}
      </SelectTrigger>
      <SelectContent>
        {orgs.map((org) => (
          <SelectItem key={org.id} value={org.id}>
            {org.name.replace(/\s*Workspace$/i, "")}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
