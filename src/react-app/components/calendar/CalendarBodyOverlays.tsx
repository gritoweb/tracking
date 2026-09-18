import { CalendarPlus, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Spinner } from "@/components/ui/spinner";

interface CalendarBodyOverlaysProps {
  entriesLoading: boolean;
  entriesError: boolean;
  onRetry: () => void;
  showEmptyState: boolean;
  isEmpty: boolean;
  ghostCount: number;
  onConvertAll: () => void;
  convertPending: boolean;
}

/** The grid's absolutely-positioned overlays: loading, load error, nothing-tracked, and the ghost-convert button. */
export function CalendarBodyOverlays({
  entriesLoading,
  entriesError,
  onRetry,
  showEmptyState,
  isEmpty,
  ghostCount,
  onConvertAll,
  convertPending,
}: CalendarBodyOverlaysProps) {
  return (
    <>
      {entriesLoading && (
        <div className="absolute inset-0 z-sticky flex items-center justify-center bg-background/60 backdrop-blur-[1px]">
          <Spinner size="lg" className="text-muted-foreground" />
        </div>
      )}

      {/* A failed fetch used to render as an ordinary empty grid — visually
          identical to a week with nothing tracked. Overlay rather than replace,
          so the dates stay on screen as context. */}
      {entriesError && !entriesLoading && (
        <div className="absolute inset-0 z-overlay flex items-center justify-center bg-background/85 p-4 backdrop-blur-[1px]">
          <EmptyState
            icon={AlertTriangle}
            title="Couldn't load this period"
            description="The request didn't get through. Your tracked time is safe."
            action={
              <Button variant="outline" size="sm" onClick={onRetry}>
                Try again
              </Button>
            }
            className="py-0"
          />
        </div>
      )}

      {/* Nothing tracked: the grid alone gives no hint that it's empty *because
          you haven't logged anything*, versus still loading or broken. */}
      {showEmptyState && !entriesLoading && !entriesError && isEmpty && (
        // The card is inert all the way through. It holds no controls, and
        // sitting in the middle of an empty grid it swallowed exactly the two
        // gestures it exists to invite: the click it tells you to make, and a
        // task dragged from the rail onto the emptiest week you own.
        <div className="pointer-events-none absolute inset-0 z-sticky flex items-center justify-center p-4">
          <EmptyState
            icon={CalendarPlus}
            title="Nothing tracked in this period"
            description="Click any empty slot to log time, or start the timer to track as you work."
            className="rounded-container bg-popover/95 px-8 py-8"
          />
        </div>
      )}

      {ghostCount > 0 && (
        <Button
          variant="secondary"
          size="sm"
          className="absolute right-4 top-3 z-overlay gap-1.5"
          onClick={onConvertAll}
          disabled={convertPending}
          title="Add every calendar event in view as a time entry"
        >
          {convertPending ? <Spinner size="sm" /> : <CalendarPlus className="h-3.5 w-3.5" />}
          Convert {ghostCount} {ghostCount === 1 ? "event" : "events"}
        </Button>
      )}
    </>
  );
}
