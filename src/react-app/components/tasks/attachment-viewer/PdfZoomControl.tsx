import { Minus, Plus } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { PdfFit } from "./PdfStage";
import { ZOOM_STEP, type ZoomPan } from "./useZoomPan";

const PRESETS = [0.5, 0.75, 1.25, 1.5, 2, 3];
const FIT_LABEL: Record<PdfFit, string> = { width: "Fit width", page: "Fit page" };

/** − / + and a picker of fit width, fit page or a fixed zoom: the PDF toolbar shared by the attachment viewer and the document previews. */
export function PdfZoomControl({ view, fit, onFit, min, max }: { view: ZoomPan; fit: PdfFit; onFit: (fit: PdfFit) => void; min: number; max: number }) {
  const value = view.zoom === 1 ? `fit-${fit}` : String(view.zoom);
  return (
    <div className="flex items-center gap-1">
      <IconButton label="Zoom out (−)" disabled={view.zoom <= min} onClick={() => view.zoomBy(1 / ZOOM_STEP)}>
        <Minus />
      </IconButton>
      <Select
        value={value}
        onValueChange={(v) => {
          if (v === "fit-width" || v === "fit-page") {
            onFit(v === "fit-page" ? "page" : "width");
            view.reset();
          } else {
            view.zoomBy(Number(v) / view.zoom);
          }
        }}
      >
        <SelectTrigger size="sm" className="w-28 tabular-nums" aria-label="Zoom">
          <SelectValue>{view.zoom === 1 ? FIT_LABEL[fit] : `${Math.round(view.zoom * 100)}%`}</SelectValue>
        </SelectTrigger>
        {/* Popper: a zoom like 137% is no item to align the list on. */}
        <SelectContent position="popper" align="end">
          <SelectItem value="fit-width">Fit width</SelectItem>
          <SelectItem value="fit-page">Fit page</SelectItem>
          {PRESETS.filter((p) => p >= min && p <= max).map((p) => (
            <SelectItem key={p} value={String(p)}>{`${Math.round(p * 100)}%`}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <IconButton label="Zoom in (+)" disabled={view.zoom >= max} onClick={() => view.zoomBy(ZOOM_STEP)}>
        <Plus />
      </IconButton>
    </div>
  );
}
