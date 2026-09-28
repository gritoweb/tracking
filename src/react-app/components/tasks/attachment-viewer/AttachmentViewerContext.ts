import { createContext, useContext } from "react";

/** Opens a task attachment in the viewer; null outside a task, where a link just follows its href. */
export const AttachmentViewerContext = createContext<((attachmentId: string) => void) | null>(null);

export const useOpenAttachment = () => useContext(AttachmentViewerContext);

const ATTACHMENT_HREF = /^\/api\/attachments\/([\w-]+)$/;

/** The attachment id a link in rich text points at, or null for any other link. */
export function attachmentIdFromHref(href: string | null): string | null {
  return href?.match(ATTACHMENT_HREF)?.[1] ?? null;
}
