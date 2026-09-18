import type { Play } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Layout primitive — one consistent card shell across every tool result
// (fold.run chat/tool-cards, remapped to our semantic tokens rather than raw
// emerald/amber so it obeys the design system's status palette).
// ---------------------------------------------------------------------------

export type Tone = "muted" | "ok" | "warn" | "error";

const TONE_SHELL: Record<Tone, string> = {
  muted: "border-border bg-muted/40",
  ok: "border-success/30 bg-success/5",
  warn: "border-warning/30 bg-warning/5",
  error: "border-destructive/40 bg-destructive/10",
};
const TONE_ICON: Record<Tone, string> = {
  muted: "text-muted-foreground",
  ok: "text-success-ink",
  warn: "text-warning-ink",
  error: "text-destructive",
};

export function ToolResultCard({
  icon: Icon,
  tone = "muted",
  spin = false,
  title,
  children,
}: {
  /** Omitted when `spin` is set — the busy state supplies its own indicator. */
  icon?: typeof Play;
  tone?: Tone;
  spin?: boolean;
  title: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border px-3 py-2 text-xs", TONE_SHELL[tone])}>
      <div className="flex items-center gap-2">
        {spin ? (
          <Spinner size="sm" className={TONE_ICON[tone]} />
        ) : (
          Icon && <Icon className={cn("h-3.5 w-3.5 shrink-0", TONE_ICON[tone])} />
        )}
        <span className="min-w-0 flex-1 font-medium text-foreground">{title}</span>
      </div>
      {children && <div className="mt-1 pl-5.5 text-muted-foreground">{children}</div>}
    </div>
  );
}
