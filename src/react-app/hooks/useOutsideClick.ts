import { useCallback, useEffect, useRef } from "react";

/** A press outside the ref'd element fires the callback — a callback ref, same pattern as `usePanScroll`. */
export function useOutsideClick<T extends HTMLElement>(onOutside: () => void) {
  const cleanup = useRef<(() => void) | null>(null);
  const handler = useRef(onOutside);
  useEffect(() => {
    handler.current = onOutside;
  });

  return useCallback((el: T | null) => {
    cleanup.current?.();
    cleanup.current = null;
    if (!el) return;

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      // A Radix popover/dropdown/select renders in a portal, outside this element's DOM
      // subtree — without this guard, picking a date (or, one level deeper, creating a
      // client inside a nested Select while creating a project) reads as "clicked
      // outside" and closes the whole card. Popover/DropdownMenu share one wrapper
      // (react-popper's), but Select has its own portal with no such marker — confirmed
      // by walking the live DOM, not assumed — so it needs its own check.
      if (target.closest("[data-radix-popper-content-wrapper], [data-radix-select-viewport]")) return;
      if (!el.contains(target)) handler.current();
    };

    document.addEventListener("pointerdown", onPointerDown);
    cleanup.current = () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);
}
