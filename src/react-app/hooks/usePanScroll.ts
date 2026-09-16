import { useCallback, useRef } from "react";

const INTERACTIVE = 'button, a, input, textarea, select, [role="group"], [role="button"], [role="option"], [role="radio"], [contenteditable="true"]';

/** How far the pointer moves before a press counts as a pan, not a click. */
const THRESHOLD = 4;

/** Click-drag on empty background pans a wide row instead of selecting text; a callback ref, so the listener is wired outside React's render cycle. */
export function usePanScroll<T extends HTMLElement>() {
  const cleanup = useRef<(() => void) | null>(null);

  return useCallback((el: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.pointerType !== "mouse") return;
      if ((e.target as HTMLElement).closest(INTERACTIVE)) return;

      const startX = e.clientX;
      const startScroll = el.scrollLeft;
      let moved = false;

      const onMove = (move: PointerEvent) => {
        const delta = move.clientX - startX;
        if (!moved && Math.abs(delta) < THRESHOLD) return;
        if (!moved) {
          moved = true;
          document.body.style.userSelect = "none";
          el.style.cursor = "grabbing";
        }
        move.preventDefault();
        el.scrollLeft = startScroll - delta;
      };

      const onUp = () => {
        el.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    };

    el.addEventListener("pointerdown", onPointerDown);
    cleanup.current = () => el.removeEventListener("pointerdown", onPointerDown);
  }, []);
}
