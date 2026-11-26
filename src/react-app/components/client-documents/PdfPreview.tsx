import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useZoomPan, ZOOM_STEP } from "@/components/tasks/attachment-viewer/useZoomPan";
import { PdfZoomControl } from "@/components/tasks/attachment-viewer/PdfZoomControl";
import type { PdfFit } from "@/components/tasks/attachment-viewer/PdfStage";
import { cn } from "@/lib/utils";

// The attachment viewer's PDF stage: same rendering, scroll and wheel/pinch zoom.
const PdfStage = lazy(() => import("@/components/tasks/attachment-viewer/PdfStage"));
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const noop = () => {};

/** A generated PDF in the attachment viewer's stage and zoom bar, opening on the whole page; `actions` sit at the bar's start. */
export function PdfPreview({ blob, actions, className }: { blob: Blob | null; actions?: ReactNode; className?: string }) {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  // Released a moment after the next file replaces it, once the stage has let go of it.
  useEffect(() => () => {
    if (url) setTimeout(() => URL.revokeObjectURL(url), 5000);
  }, [url]);
  const view = useZoomPan(MIN_ZOOM, MAX_ZOOM);
  const [fit, setFit] = useState<PdfFit>("page");

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "+" || e.key === "=") view.zoomBy(ZOOM_STEP);
    else if (e.key === "-") view.zoomBy(1 / ZOOM_STEP);
    else if (e.key === "0") view.reset();
    else return;
    e.preventDefault();
  };

  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-container bg-muted/40", className)} onKeyDown={onKeyDown}>
      <div className="flex h-12 shrink-0 items-center gap-1 border-b px-3">
        <div className="flex flex-1 items-center gap-1">{actions}</div>
        <PdfZoomControl view={view} fit={fit} onFit={setFit} min={MIN_ZOOM} max={MAX_ZOOM} />
      </div>
      <div className="relative min-h-0 flex-1">
        {url ? (
          <Suspense fallback={<Skeleton className="m-6 aspect-[1/1.414]" />}>
            <PdfStage url={url} zoom={view.zoom} fit={fit} onZoomBy={view.zoomBy} onError={noop} />
          </Suspense>
        ) : (
          <Skeleton className="m-6 aspect-[1/1.414]" />
        )}
      </div>
    </div>
  );
}
