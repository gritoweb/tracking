export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Why a file can't be attached, in words for a toast, or null when it can. One rule for every way an image gets in. */
export function imageProblem(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return "Only PNG, JPEG, WebP and GIF images are accepted";
  if (file.size > MAX_ATTACHMENT_BYTES) return "Image is larger than 10 MB";
  return null;
}

export function imageFile(items: DataTransferItemList | FileList | null | undefined): File | null {
  if (!items) return null;
  for (const item of items) {
    const file = "getAsFile" in item ? item.getAsFile() : (item as File);
    if (file?.type.startsWith("image/")) return file;
  }
  return null;
}
