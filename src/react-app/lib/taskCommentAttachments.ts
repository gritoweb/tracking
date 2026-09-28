import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENT_LABEL } from "@shared/attachments";

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Why an image can't go into a description or comment, in words for a toast, or null when it can. */
export function imageProblem(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) return "Only PNG, JPEG, WebP and GIF images can go into the text";
  if (file.size > MAX_ATTACHMENT_BYTES) return `Image is larger than ${MAX_ATTACHMENT_LABEL}`;
  return null;
}

/** Why a file can't be attached to a task, or null: any file is accepted, only its size is limited. */
export function attachmentProblem(file: File): string | null {
  if (file.size > MAX_ATTACHMENT_BYTES) return `File is larger than ${MAX_ATTACHMENT_LABEL}`;
  return null;
}
