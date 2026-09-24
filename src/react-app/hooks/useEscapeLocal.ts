import { useCallback, useEffect, useRef } from "react";
import { ESCAPE_LOCAL_EVENT } from "@/lib/escapeLocal";

/** Props for the element of an in-place edit: Esc inside it runs `onEscape` and leaves the dialog/sheet around it open. */
export function useEscapeLocal(onEscape: () => void) {
  const latest = useRef(onEscape);
  useEffect(() => {
    latest.current = onEscape;
  });
  const ref = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const handle = () => latest.current();
    el.addEventListener(ESCAPE_LOCAL_EVENT, handle);
    return () => el.removeEventListener(ESCAPE_LOCAL_EVENT, handle);
  }, []);
  return { ref, "data-escape-local": "" } as const;
}
