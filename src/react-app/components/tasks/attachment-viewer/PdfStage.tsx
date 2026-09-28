import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy, type RenderTask } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Spinner } from "@/components/ui/spinner";

// Served from our own origin, so the app's CSP (worker/script from 'self') admits it; pdf.js 6 never evals.
GlobalWorkerOptions.workerSrc = workerUrl;

// Points (72 dpi) to CSS pixels (96 dpi): without it "100%" renders a quarter too small.
const CSS_UNITS = 96 / 72;
const PAGE_GUTTER = 48;
// Re-rendering on every zoom tick would stall; the canvas is CSS-scaled until the zoom settles.
const RENDER_DELAY_MS = 150;

interface Size {
  width: number;
  height: number;
}

function PdfPage({ doc, index, size, scale }: { doc: PDFDocumentProxy; index: number; size: Size; scale: number }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "100% 0px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let task: RenderTask | null = null;
    const timer = window.setTimeout(async () => {
      const target = canvas.current;
      if (!target) return;
      const page = await doc.getPage(index + 1);
      const viewport = page.getViewport({ scale: scale * CSS_UNITS });
      const output = Math.min(window.devicePixelRatio || 1, 2);
      target.width = Math.floor(viewport.width * output);
      target.height = Math.floor(viewport.height * output);
      task = page.render({
        canvas: target,
        viewport,
        transform: output !== 1 ? [output, 0, 0, output, 0, 0] : undefined,
      });
      // A zoom or scroll cancels the render in flight; only a real failure is worth a log line.
      task.promise.catch((e: unknown) => {
        if ((e as { name?: string } | null)?.name !== "RenderingCancelledException") {
          console.warn("pdf page render failed", { page: index + 1, error: String(e) });
        }
      });
    }, RENDER_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
      task?.cancel();
    };
  }, [doc, index, scale, visible]);

  return (
    <div
      ref={box}
      className="shrink-0 border bg-background"
      style={{ width: size.width * scale, height: size.height * scale }}
    >
      <canvas ref={canvas} className="block h-full w-full" aria-label={`Page ${index + 1}`} />
    </div>
  );
}

interface PdfStageProps {
  url: string;
  zoom: number;
  onZoomBy: (factor: number) => void;
  onError: () => void;
}

/** Every page stacked in one scroll, fitted to the width at zoom 1; Ctrl/⌘ + wheel or a trackpad pinch zooms. */
export default function PdfStage({ url, zoom, onZoomBy, onError }: PdfStageProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [sizes, setSizes] = useState<Size[]>([]);
  const [fitWidth, setFitWidth] = useState(0);

  useEffect(() => {
    // Set on cleanup: a load we tore down ourselves (file switched, dev double-mount) rejects, and that isn't a failure.
    let discarded = false;
    const task = getDocument({ url, disableAutoFetch: true, rangeChunkSize: 131072 });
    task.promise
      .then(async (loaded) => {
        const pages = await Promise.all(
          Array.from({ length: loaded.numPages }, (_, i) =>
            loaded.getPage(i + 1).then((p) => {
              const v = p.getViewport({ scale: CSS_UNITS });
              return { width: v.width, height: v.height };
            })
          )
        );
        if (discarded) return;
        setSizes(pages);
        setDoc(loaded);
      })
      .catch((e: unknown) => {
        if (discarded) return;
        console.warn("pdf open failed", { url, error: String(e) });
        onError();
      });
    // Frees the pdf.js worker and every page buffer when the viewer closes or moves to another file.
    return () => {
      discarded = true;
      void task.destroy();
    };
  }, [url, onError]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setFitWidth(el.clientWidth - PAGE_GUTTER));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      onZoomBy(Math.exp(-e.deltaY * 0.01));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [onZoomBy]);

  const widest = Math.max(1, ...sizes.map((s) => s.width));
  const scale = fitWidth > 0 ? (fitWidth / widest) * zoom : 0;

  // Keep the same spot of the document in view while zooming.
  const lastScale = useRef(scale);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && lastScale.current > 0 && scale > 0 && scale !== lastScale.current) {
      const ratio = scale / lastScale.current;
      el.scrollTop *= ratio;
      el.scrollLeft *= ratio;
    }
    lastScale.current = scale;
  }, [scale]);

  return (
    <div ref={scroller} className="h-full w-full overflow-auto [scrollbar-gutter:stable]">
      {!doc || scale === 0 ? (
        <div className="flex h-full items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <div className="flex w-fit min-w-full flex-col items-center gap-4 p-6">
          {sizes.map((size, i) => (
            <PdfPage key={i} doc={doc} index={i} size={size} scale={scale} />
          ))}
        </div>
      )}
    </div>
  );
}
