import { useEffect, useRef, useState } from "react";
import type { Point, ZoomPan } from "./useZoomPan";

interface ImageStageProps {
  src: string;
  alt: string;
  view: ZoomPan;
}

/** An image fitted to the stage: wheel or pinch zooms around the pointer, drag pans, double-click toggles 1× and 2.5×. */
export function ImageStage({ src, alt, view }: ImageStageProps) {
  const stage = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const pinch = useRef<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const { zoom, pan, zoomBy, panBy } = view;

  // Position relative to the stage centre, the origin the transform scales around.
  const fromCentre = (clientX: number, clientY: number): Point => {
    const box = stage.current!.getBoundingClientRect();
    return { x: clientX - box.left - box.width / 2, y: clientY - box.top - box.height / 2 };
  };

  // Registered by hand: React's onWheel is passive, so it can't stop the page from scrolling instead.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      zoomBy(Math.exp(-e.deltaY * 0.0015), { x: e.clientX - box.left - box.width / 2, y: e.clientY - box.top - box.height / 2 });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const onPointerDown = (e: React.PointerEvent) => {
    stage.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const last = pointers.current.get(e.pointerId);
    if (!last) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.current) zoomBy(distance / pinch.current, fromCentre((a.x + b.x) / 2, (a.y + b.y) / 2));
      pinch.current = distance;
      return;
    }
    if (zoom > 1) panBy(e.clientX - last.x, e.clientY - last.y);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) setDragging(false);
  };

  return (
    <div
      ref={stage}
      className="relative flex h-full w-full touch-none items-center justify-center overflow-hidden select-none"
      style={{ cursor: zoom > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={(e) => zoomBy(zoom > 1 ? 1 / zoom : 2.5, fromCentre(e.clientX, e.clientY))}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-h-full max-w-full object-contain"
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, willChange: "transform" }}
      />
    </div>
  );
}
