// One contract for task attachments, read by the worker (the authority) and the SPA (the hint).

/** Largest file a task accepts; the worker buffers the upload, so this stays well under its 128 MB memory. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENT_LABEL = "25 MB";

export type AttachmentKind = "png" | "jpg" | "webp" | "gif" | "pdf" | "docx" | "xlsx" | "pptx" | "txt" | "csv" | "text" | "file";

export interface AttachmentFormat {
  kind: AttachmentKind;
  label: string;
  /** The extensions this kind is stored under; empty for the catch-all kinds, which keep the file's own name. */
  extensions: readonly string[];
  contentType: string;
  image: boolean;
}

export const ATTACHMENT_FORMATS: readonly AttachmentFormat[] = [
  { kind: "png", label: "PNG", extensions: ["png"], contentType: "image/png", image: true },
  { kind: "jpg", label: "JPEG", extensions: ["jpg", "jpeg"], contentType: "image/jpeg", image: true },
  { kind: "webp", label: "WebP", extensions: ["webp"], contentType: "image/webp", image: true },
  { kind: "gif", label: "GIF", extensions: ["gif"], contentType: "image/gif", image: true },
  { kind: "pdf", label: "PDF", extensions: ["pdf"], contentType: "application/pdf", image: false },
  {
    kind: "docx",
    label: "Word",
    extensions: ["docx"],
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    image: false,
  },
  {
    kind: "xlsx",
    label: "Excel",
    extensions: ["xlsx"],
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    image: false,
  },
  {
    kind: "pptx",
    label: "PowerPoint",
    extensions: ["pptx"],
    contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    image: false,
  },
  { kind: "txt", label: "TXT", extensions: ["txt"], contentType: "text/plain; charset=utf-8", image: false },
  { kind: "csv", label: "CSV", extensions: ["csv"], contentType: "text/csv; charset=utf-8", image: false },
  // Any other readable text (.md, .mmd, .json, .svg, .html…): shown as plain text, never interpreted.
  { kind: "text", label: "Text", extensions: [], contentType: "text/plain; charset=utf-8", image: false },
  // Everything else: stored as opaque bytes and only ever downloaded.
  { kind: "file", label: "File", extensions: [], contentType: "application/octet-stream", image: false },
];

export function formatForKind(kind: AttachmentKind): AttachmentFormat {
  return ATTACHMENT_FORMATS.find((f) => f.kind === kind)!;
}

export function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot > 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

export function isImageContentType(contentType: string): boolean {
  return ATTACHMENT_FORMATS.some((f) => f.image && f.contentType === contentType);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
