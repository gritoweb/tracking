import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TimerControl } from "./TimerControl";
import { FavoritesMenu } from "./FavoritesMenu";
import { ResumeLastButton } from "./ResumeLastButton";
import { AssistantButton } from "@/components/assistant/AssistantButton";
import { NotificationBell } from "@/components/layout/NotificationBell";
import type { EntrySuggestion } from "@shared/schemas";

interface FavoriteDraft {
  description: string;
  projectId: string | null;
  taskId: string | null;
  tags: string[];
  billable: boolean;
}

interface TimerBarControlsProps {
  isRunning: boolean;
  onDiscard: () => void;
  onResume: (suggestion: EntrySuggestion) => void;
  favoritesCurrent: FavoriteDraft;
  onStart: () => void;
  onStop: () => void;
  startDisabled: boolean;
}

/** Discard / Resume-or-Favorites / the Start-Stop capsule / notifications / assistant. */
export function TimerBarControls({
  isRunning,
  onDiscard,
  onResume,
  favoritesCurrent,
  onStart,
  onStop,
  startDisabled,
}: TimerBarControlsProps) {
  return (
    // Control cluster. One shrink-0 unit, pushed right by `ml-auto`: it wraps
    // to its own row as a whole when the chips can't make room, and never
    // gives up width to them. Stop must be on screen at every width — that
    // is the invariant `e2e/timer-bar-responsive.spec.ts` guards.
    <div className="ml-auto flex shrink-0 items-center gap-1 xl:gap-2">
      {/* Discard button (only when running) */}
      {isRunning && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="tt-touch animate-in fade-in text-muted-foreground duration-base ease-out-quart hover:text-destructive"
              onClick={onDiscard}
              aria-label="Discard timer"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Discard timer
            <span className="ml-1.5 text-background/60">Alt+Shift+X</span>
          </TooltipContent>
        </Tooltip>
      )}

      {/* Resume the last thing tracked, and one-click start from a saved
          preset. Both are idle-only: neither means anything while a timer is
          already running, and the slot they leave is what the Discard button
          takes above. */}
      {!isRunning && (
        <>
          <ResumeLastButton onResume={onResume} />
          <FavoritesMenu current={favoritesCurrent} />
        </>
      )}

      {/* Combined elapsed + Start/Stop capsule */}
      <TimerControl isRunning={isRunning} onStart={onStart} onStop={onStop} startDisabled={startDisabled} />

      <NotificationBell />
      <AssistantButton />
    </div>
  );
}
