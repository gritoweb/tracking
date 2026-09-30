import { useEffect, useState } from "react";

/** A text attachment's contents for a preview: `null` while loading, `failed` if it couldn't be read. */
export function useAttachmentText(url: string): { text: string | null; failed: boolean } {
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: controller.signal })
      .then((res) => (res.ok ? res.text() : Promise.reject(new Error(String(res.status)))))
      .then(setText)
      .catch((e: unknown) => {
        if (!controller.signal.aborted) {
          console.warn("attachment text preview failed", { url, error: String(e) });
          setFailed(true);
        }
      });
    return () => controller.abort();
  }, [url]);

  return { text, failed };
}
