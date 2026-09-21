import type { ReactNode } from "react";

/** The small supporting line under a settings label or list item. */
export function SettingsHint({ children }: { children: ReactNode }) {
  return <p className="mt-1 text-xs leading-normal text-muted-foreground">{children}</p>;
}
