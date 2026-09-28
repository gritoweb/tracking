import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";

// Enough to read a note or skim a CSV; the full file is one Download away.
const PREVIEW_CHARS = 200_000;

/** A TXT or CSV shown as plain text — React escapes it, so nothing in the file can run. */
export function TextStage({ url, zoom }: { url: string; zoom: number }) {
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

  if (failed) return <p className="p-8 text-center text-sm text-muted-foreground">Couldn't load this file. Download it instead.</p>;
  if (text === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  const cut = text.length > PREVIEW_CHARS;
  return (
    <div className="h-full w-full overflow-auto p-6">
      <pre className="font-mono whitespace-pre-wrap break-words text-foreground" style={{ fontSize: `${0.8125 * zoom}rem` }}>
        {cut ? text.slice(0, PREVIEW_CHARS) : text}
      </pre>
      {cut && <p className="mt-4 text-xs text-muted-foreground">Showing the first part of the file — download it to see everything.</p>}
    </div>
  );
}
