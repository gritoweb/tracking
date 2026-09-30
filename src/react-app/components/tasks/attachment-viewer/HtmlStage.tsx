import { Spinner } from "@/components/ui/spinner";
import { useAttachmentText } from "./useAttachmentText";

// No script-src and no connect-src: the page can draw (CSS, images, fonts) but never run code or call out.
const PREVIEW_CSP =
  "default-src 'none'; style-src 'unsafe-inline' https:; img-src https: data:; font-src https: data:; media-src https: data:";

/** An HTML attachment rendered as a page: an empty-`sandbox` iframe (no scripts, forms or same-origin) with a CSP that blocks the network. */
export function HtmlStage({ url, zoom }: { url: string; zoom: number }) {
  const { text, failed } = useAttachmentText(url);

  if (failed) return <p className="p-8 text-center text-sm text-muted-foreground">Couldn't load this file. Download it instead.</p>;
  if (text === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  // The browser's default page colour (Canvas) unless the file sets one; its own CSS comes after and wins.
  const doc = `<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}"><style>html{background:Canvas}</style>${text}`;
  return (
    <div className="h-full w-full overflow-hidden">
      {/* Scaled from the corner and sized by the inverse, so zoom never reloads the page. */}
      <iframe
        title="HTML preview"
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={doc}
        className="origin-top-left border-0"
        style={{ width: `${100 / zoom}%`, height: `${100 / zoom}%`, transform: `scale(${zoom})` }}
      />
    </div>
  );
}
