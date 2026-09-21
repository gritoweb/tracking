import type { ReactNode } from "react";

/** The full-height, tinted, centred ground the sign-in and invitation pages sit on. */
export function CenteredPage({ children }: { children: ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">{children}</main>;
}
