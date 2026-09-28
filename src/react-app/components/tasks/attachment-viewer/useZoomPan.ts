import { useCallback, useState } from "react";

export interface Point {
  x: number;
  y: number;
}

export const ZOOM_STEP = 1.25;

/** Zoom (1 = fitted) and pan in one state, so a zoom around a point moves both in the same render. */
export function useZoomPan(min: number, max: number) {
  const [view, setView] = useState<{ zoom: number; pan: Point }>({ zoom: 1, pan: { x: 0, y: 0 } });

  /** Multiplies the zoom, keeping `at` (a point relative to the stage centre) still on screen. */
  const zoomBy = useCallback(
    (factor: number, at: Point = { x: 0, y: 0 }) =>
      setView(({ zoom, pan }) => {
        const next = Math.min(max, Math.max(min, zoom * factor));
        const ratio = next / zoom;
        // Back to fitted means back to centred, or a zoom-out would leave the image off to one side.
        if (next === 1) return { zoom: 1, pan: { x: 0, y: 0 } };
        return { zoom: next, pan: { x: at.x - (at.x - pan.x) * ratio, y: at.y - (at.y - pan.y) * ratio } };
      }),
    [min, max]
  );

  const panBy = useCallback((dx: number, dy: number) => setView((v) => ({ ...v, pan: { x: v.pan.x + dx, y: v.pan.y + dy } })), []);
  const reset = useCallback(() => setView({ zoom: 1, pan: { x: 0, y: 0 } }), []);

  return { zoom: view.zoom, pan: view.pan, zoomBy, panBy, reset };
}

export type ZoomPan = ReturnType<typeof useZoomPan>;
