import { Check, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Spinner } from "@/components/ui/spinner";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { cn } from "@/lib/utils";
import type { TimeEntry, Integration } from "@shared/schemas";

interface EntryRowIndicatorsProps {
  entry: TimeEntry;
  integration?: Integration;
  isPushing: boolean;
  pushTitle: string;
}

/** Sync status glyph, billable "$" and the logging user's avatar — persistent row indicators. */
export function EntryRowIndicators({ entry, integration, isPushing, pushTitle }: EntryRowIndicatorsProps) {
  return (
    <>
      {/* Integration sync status — persistent indicator, only once it's meaningful */}
      {integration && (isPushing || entry.syncStatus === "synced" || entry.syncStatus === "error") && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              aria-label={pushTitle}
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center",
                entry.syncStatus === "synced"
                  ? "text-success-ink"
                  : entry.syncStatus === "error"
                    ? "text-destructive"
                    : "text-muted-foreground"
              )}
            >
              {isPushing ? (
                <Spinner size="sm" />
              ) : entry.syncStatus === "synced" ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <AlertTriangle className="h-3.5 w-3.5" />
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent>{pushTitle}</TooltipContent>
        </Tooltip>
      )}

      {/* Billable indicator */}
      {entry.billable && (
        <Tooltip>
          <TooltipTrigger asChild>
            {/* Was a bare <span> whose only "Billable" text lived in a mouse-only
                tooltip, so the state was invisible to screen readers. An sr-only
                label announces it in reading order — better than making it
                focusable, which would add a tab stop per row to an already
                tab-stop-heavy list for something that isn't an action. */}
            <span className="text-micro font-semibold text-primary-ink">
              <span aria-hidden>$</span>
              <span className="sr-only">Billable</span>
            </span>
          </TooltipTrigger>
          <TooltipContent>Billable</TooltipContent>
        </Tooltip>
      )}

      {/* Who logged it — omitted when unknown (pre-existing rows, or cron-
          materialized entries with no single human creator). */}
      {(entry.userName || entry.userEmail) && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="hidden shrink-0 sm:inline-flex">
              <UserAvatar
                name={entry.userName}
                email={entry.userEmail}
                image={entry.userImage}
                className="h-5 w-5 text-micro"
              />
            </span>
          </TooltipTrigger>
          <TooltipContent>{entry.userName ?? entry.userEmail}</TooltipContent>
        </Tooltip>
      )}
    </>
  );
}
