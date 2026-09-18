import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SettingsCardHeaderProps {
  icon: LucideIcon;
  title: ReactNode;
  action?: ReactNode;
  className?: string;
}

/** The icon + title CardHeader shape repeated across settings cards, with an optional trailing action. */
export function SettingsCardHeader({ icon: Icon, title, action, className }: SettingsCardHeaderProps) {
  return (
    <CardHeader className={cn(action && "flex flex-row items-center justify-between gap-2", className)}>
      <CardTitle className="flex items-center gap-2 text-base">
        <Icon className="h-4 w-4" />
        {title}
      </CardTitle>
      {action}
    </CardHeader>
  );
}
