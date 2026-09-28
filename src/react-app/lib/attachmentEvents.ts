// The Attachments section tells every open editor when a file is deleted, so the text drops it at once.
const EVENT = "tt:attachment-deleted";

export function announceAttachmentDeleted(attachmentId: string): void {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: attachmentId }));
}

export function onAttachmentDeleted(listener: (attachmentId: string) => void): () => void {
  const handler = (event: Event) => listener((event as CustomEvent<string>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
