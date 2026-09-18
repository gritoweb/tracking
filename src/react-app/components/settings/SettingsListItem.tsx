import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface SettingsListItemProps {
  icon?: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  className?: string;
}

/** One bordered row in a settings list (a session, a passkey, a connected account…). */
export function SettingsListItem({ icon: Icon, title, subtitle, children, className }: SettingsListItemProps) {
  return (
    <div className={cn("flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm", className)}>
      <div className="flex min-w-0 items-center gap-3">
        {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0">
          <div className="flex items-center gap-2">{title}</div>
          {subtitle && <p className="mt-1 text-xs leading-normal text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {children}
    </div>
  );
}
