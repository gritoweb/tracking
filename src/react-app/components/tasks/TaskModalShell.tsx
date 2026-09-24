import { useEffect, useRef, type ReactNode } from "react";
import { MessageCircle, PanelRightClose, PanelRightOpen } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

interface TaskModalShellProps {
  open: boolean;
  onClose: () => void;
  taskName: string;
  /** Opened from a comments link: bring the comments column into view (it's below the content on a narrow screen). */
  focusComments: boolean;
  commentsCount: number;
  toolbar: ReactNode;
  title: ReactNode;
  content: ReactNode;
  comments: ReactNode;
}

/** The task detail as a centered modal: content on the left, comments on the right, which a side rail folds away. */
export function TaskModalShell({
  open,
  onClose,
  taskName,
  focusComments,
  commentsCount,
  toolbar,
  title,
  content,
  comments,
}: TaskModalShellProps) {
  const commentsRef = useRef<HTMLElement>(null);
  const activityOpen = useUIStore((s) => s.taskActivityOpen);
  const setActivityOpen = useUIStore((s) => s.setTaskActivityOpen);
  const showActivity = activityOpen;

  useEffect(() => {
    if (!open || !focusComments) return;
    // Arriving from a comments link unfolds the comments, whatever the folded preference was.
    setActivityOpen(true);
    // After the open animation has laid the dialog out, or there is nothing to scroll to yet.
    const id = requestAnimationFrame(() => commentsRef.current?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(id);
  }, [open, focusComments, setActivityOpen]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="task" className="flex flex-col" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{taskName}</DialogTitle>
        {toolbar}

        {/* One scroll on a narrow screen (columns stack), one scroll per column from lg up. */}
        <div
          className={cn(
            "grid min-h-0 flex-1 overflow-y-auto lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden",
            // Same two tracks either way, so the comments column's width animates instead of snapping.
            "lg:transition-[grid-template-columns] lg:duration-slow lg:ease-out-quart",
            showActivity
              ? "lg:grid-cols-[minmax(0,1fr)_var(--size-task-activity)]"
              : "lg:grid-cols-[minmax(0,1fr)_0px]"
          )}
        >
          {/* The fold button lives inside this scrolling column, so the column's scrollbar sits after it, not between. */}
          <div className="min-w-0 lg:flex lg:overflow-y-auto">
            <div className="min-w-0 flex-1 px-6 py-5 lg:px-8 lg:py-6">
              {/* Centred at a reading width instead of stretching to the column's edge. */}
              <div className="mx-auto max-w-(--size-task-content) space-y-5">
                {title}
                {content}
              </div>
            </div>
            {/* Folds the comments away for a full-width read, and back; stays in view while the column scrolls. */}
            <div className="sticky top-0 hidden self-start px-1.5 py-4 lg:block">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                aria-label={showActivity ? "Hide comments" : "Show comments"}
                title={showActivity ? "Hide comments" : "Show comments"}
                aria-expanded={showActivity}
                onClick={() => setActivityOpen(!showActivity)}
              >
                {showActivity ? <PanelRightClose /> : <PanelRightOpen />}
              </Button>
            </div>
          </div>

          <section
            ref={commentsRef}
            aria-label="Comments"
            // Folded: out of the tab order and the accessibility tree while it slides shut and stays shut.
            inert={!showActivity}
            className="flex min-h-0 min-w-0 flex-col gap-3 bg-muted/50 px-5 py-4 lg:w-(--size-task-activity) lg:overflow-hidden"
          >
            <h2 className="flex shrink-0 items-center gap-1.5 text-sm font-semibold">
              <MessageCircle className="h-3.5 w-3.5" />
              Comments
              {commentsCount > 0 && <span className="tabular-nums font-normal text-muted-foreground">{commentsCount}</span>}
            </h2>
            {comments}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
