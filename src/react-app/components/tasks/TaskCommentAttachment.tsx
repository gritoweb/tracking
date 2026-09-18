import { ClearButton } from "@/components/ui/clear-button";

/** A pending or already-sent image — a small thumbnail with an X to drop it before/after posting. */
export function AttachmentPreview({
  url,
  filename,
  onRemove,
}: {
  url: string;
  filename?: string | null;
  onRemove?: () => void;
}) {
  return (
    <div className="relative inline-block h-16 w-16">
      <img src={url} alt={filename ?? "Attachment"} className="h-16 w-16 rounded-md border object-cover" />
      {onRemove && (
        <ClearButton
          aria-label="Remove image"
          onClick={onRemove}
          className="absolute -right-1.5 -top-1.5 bg-background"
        />
      )}
    </div>
  );
}
