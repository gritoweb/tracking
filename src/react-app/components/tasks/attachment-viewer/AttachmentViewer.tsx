import { lazy, Suspense, useCallback, useState } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, Maximize2, Minus, Plus, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { fileExtension, formatFileSize, isImageContentType } from "@shared/attachments";
import type { TaskAttachment } from "@shared/schemas";
import { ImageStage } from "./ImageStage";
import { TextStage } from "./TextStage";
import { HtmlStage } from "./HtmlStage";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useZoomPan, ZOOM_STEP } from "./useZoomPan";

// pdf.js (~450 KB + a 1.3 MB worker) loads only when someone opens a PDF.
const PdfStage = lazy(() => import("./PdfStage"));

type Kind = "image" | "pdf" | "html" | "text" | "other";

function kindOf(attachment: TaskAttachment): Kind {
  if (isImageContentType(attachment.contentType)) return "image";
  if (attachment.contentType === "application/pdf") return "pdf";
  // Stored as plain text (never served as HTML); the viewer renders it in a sandbox.
  if (attachment.contentType.startsWith("text/") && ["html", "htm"].includes(fileExtension(attachment.filename))) return "html";
  if (attachment.contentType.startsWith("text/")) return "text";
  return "other";
}

const ZOOM_RANGE: Record<Kind, [number, number]> = { image: [1, 8], pdf: [0.5, 4], html: [0.5, 2], text: [0.75, 2], other: [1, 1] };

function ViewerBody({ attachment, kind, view, onPdfError, showSource }: {
  attachment: TaskAttachment;
  kind: Kind;
  view: ReturnType<typeof useZoomPan>;
  onPdfError: () => void;
  /** HTML only: its source as text instead of the rendered page. */
  showSource: boolean;
}) {
  if (kind === "image") return <ImageStage src={attachment.url} alt={attachment.filename} view={view} />;
  if (kind === "pdf") {
    return (
      <Suspense fallback={<div className="flex h-full items-center justify-center"><Spinner /></div>}>
        <PdfStage url={attachment.url} zoom={view.zoom} onZoomBy={view.zoomBy} onError={onPdfError} />
      </Suspense>
    );
  }
  if (kind === "html") return showSource ? <TextStage url={attachment.url} zoom={view.zoom} /> : <HtmlStage url={attachment.url} zoom={view.zoom} />;
  if (kind === "text") return <TextStage url={attachment.url} zoom={view.zoom} />;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <FileText className="h-10 w-10 text-muted-foreground" />
      <p className="text-sm font-medium">{attachment.filename}</p>
      <p className="text-xs text-muted-foreground">There's no preview for this kind of file. Download it to open it.</p>
      <Button asChild size="sm">
        <a href={attachment.url} download={attachment.filename}>
          <Download className="h-3.5 w-3.5" />
          Download
        </a>
      </Button>
    </div>
  );
}

interface ViewerPaneProps {
  attachment: TaskAttachment;
  position: string | null;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
}

/** One file's toolbar and stage; remounted per file, so each opens fitted rather than at the last one's zoom. */
function ViewerPane({ attachment, position, onPrevious, onNext, onClose }: ViewerPaneProps) {
  const kind = kindOf(attachment);
  const [min, max] = ZOOM_RANGE[kind];
  const view = useZoomPan(min, max);
  const [pdfFailed, setPdfFailed] = useState(false);
  const [htmlView, setHtmlView] = useState<"preview" | "code">("preview");
  const onPdfError = useCallback(() => setPdfFailed(true), []);
  const zoomable = kind !== "other" && !(kind === "pdf" && pdfFailed);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" && onNext) onNext();
    else if (e.key === "ArrowLeft" && onPrevious) onPrevious();
    else if (zoomable && (e.key === "+" || e.key === "=")) view.zoomBy(ZOOM_STEP);
    else if (zoomable && e.key === "-") view.zoomBy(1 / ZOOM_STEP);
    else if (zoomable && e.key === "0") view.reset();
    else return;
    e.preventDefault();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <div className="min-w-0 flex-1">
          <DialogTitle className="truncate text-sm font-medium">{attachment.filename}</DialogTitle>
          <DialogDescription className="text-micro text-muted-foreground">
            {formatFileSize(attachment.size)}
            {position && ` · ${position}`}
          </DialogDescription>
        </div>

        {onPrevious && onNext && (
          <div className="flex items-center">
            <Button variant="ghost" size="icon-sm" aria-label="Previous file" title="Previous (←)" onClick={onPrevious}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Next file" title="Next (→)" onClick={onNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}

        {kind === "html" && (
          <SegmentedControl
            value={htmlView}
            options={[
              { value: "preview", label: "Preview" },
              { value: "code", label: "Code" },
            ]}
            onChange={setHtmlView}
            label="Show the page or its code"
          />
        )}

        {zoomable && (
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Zoom out"
              title="Zoom out (−)"
              disabled={view.zoom <= min}
              onClick={() => view.zoomBy(1 / ZOOM_STEP)}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="w-12 text-center text-xs tabular-nums text-muted-foreground" aria-live="polite">
              {Math.round(view.zoom * 100)}%
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Zoom in"
              title="Zoom in (+)"
              disabled={view.zoom >= max}
              onClick={() => view.zoomBy(ZOOM_STEP)}
            >
              <Plus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" aria-label="Fit to screen" title="Fit (0)" onClick={view.reset}>
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        )}

        <Button asChild variant="ghost" size="icon-sm" aria-label="Download" title="Download">
          <a href={attachment.url} download={attachment.filename}>
            <Download className="h-4 w-4" />
          </a>
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Close" title="Close (Esc)" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="relative min-h-0 flex-1 bg-muted/40">
        {kind === "pdf" && pdfFailed ? (
          <p className="p-8 text-center text-sm text-muted-foreground">Couldn't open this PDF. Download it instead.</p>
        ) : (
          <ViewerBody attachment={attachment} kind={kind} view={view} onPdfError={onPdfError} showSource={htmlView === "code"} />
        )}
      </div>
    </div>
  );
}

interface AttachmentViewerProps {
  attachments: TaskAttachment[];
  openId: string | null;
  onOpenChange: (id: string | null) => void;
}

/** A task's files in one viewer: images and PDFs zoom (buttons, wheel, pinch), text files read, Office files download. */
export function AttachmentViewer({ attachments, openId, onOpenChange }: AttachmentViewerProps) {
  const index = attachments.findIndex((a) => a.id === openId);
  const attachment = index >= 0 ? attachments[index] : null;
  const many = attachments.length > 1;
  const go = (delta: number) => onOpenChange(attachments[(index + delta + attachments.length) % attachments.length].id);

  return (
    <Dialog open={!!attachment} onOpenChange={(open) => !open && onOpenChange(null)}>
      <DialogContent size="viewer" showCloseButton={false}>
        {attachment && (
          <ViewerPane
            key={attachment.id}
            attachment={attachment}
            position={many ? `${index + 1} of ${attachments.length}` : null}
            onPrevious={many ? () => go(-1) : null}
            onNext={many ? () => go(1) : null}
            onClose={() => onOpenChange(null)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
