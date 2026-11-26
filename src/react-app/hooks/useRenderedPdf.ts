import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

/** The PDF `render` makes from `input`, re-made a moment after `input` stops changing; `render` must be stable (module level). */
export function useRenderedPdf<T>(input: T | null, render: (input: T) => Promise<Blob>): Blob | null {
  const key = useDebouncedValue(input === null ? null : JSON.stringify(input), 300);
  const [blob, setBlob] = useState<Blob | null>(null);
  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    render(JSON.parse(key) as T)
      .then((next) => {
        if (!cancelled) setBlob(next);
      })
      // The preview is a convenience; the download still works, so the failure is only logged.
      .catch((error: unknown) => console.error("pdf preview failed", error));
    return () => {
      cancelled = true;
    };
  }, [key, render]);
  return blob;
}
