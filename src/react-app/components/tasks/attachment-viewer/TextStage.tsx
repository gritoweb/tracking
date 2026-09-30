import { Spinner } from "@/components/ui/spinner";
import { useAttachmentText } from "./useAttachmentText";

// Enough to read a note or skim a CSV; the full file is one Download away.
const PREVIEW_CHARS = 200_000;

/** A TXT, CSV or any other text (an HTML file's source too) shown as plain text — React escapes it, so nothing in the file can run. */
export function TextStage({ url, zoom }: { url: string; zoom: number }) {
  const { text, failed } = useAttachmentText(url);

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
