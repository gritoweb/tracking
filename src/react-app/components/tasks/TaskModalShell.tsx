import { useEffect, useRef, type ReactNode } from "react";
import { MessageCircle } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

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

/** The task detail as a centered modal: content on the left, comments always visible on the right — no tabs. */
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

  useEffect(() => {
    if (!open || !focusComments) return;
    // After the open animation has laid the dialog out, or there is nothing to scroll to yet.
    const id = requestAnimationFrame(() => commentsRef.current?.scrollIntoView({ block: "start" }));
    return () => cancelAnimationFrame(id);
  }, [open, focusComments]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="task" className="flex flex-col" aria-describedby={undefined}>
        <DialogTitle className="sr-only">{taskName}</DialogTitle>
        {toolbar}

        {/* One scroll on a narrow screen (columns stack), one scroll per column from lg up. */}
        <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(0,var(--size-task-activity))] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
          <div className="min-w-0 px-6 py-5 lg:overflow-y-auto lg:px-8 lg:py-6">
            {/* Centred at a reading width instead of stretching to the column's edge. */}
            <div className="mx-auto max-w-(--size-task-content) space-y-5">
              {title}
              {content}
            </div>
          </div>

          <section
            ref={commentsRef}
            aria-label="Comments"
            className="flex min-h-0 min-w-0 flex-col gap-3 bg-muted/50 px-5 py-4"
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
