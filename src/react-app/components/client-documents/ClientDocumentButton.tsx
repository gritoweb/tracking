import { useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientDocumentDialog } from "./ClientDocumentDialog";
import type { DocumentPreset } from "@/lib/clientDocuments";

/**
 * Opens the client PDF generator; `clientId` fixes the client when shown on its page.
 * A `preset` (from a link) opens it straight away, filled in; `onClose` lets the page drop that link.
 */
export function ClientDocumentButton({
  clientId,
  preset,
  onClose,
}: {
  clientId?: string;
  preset?: DocumentPreset | null;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(Boolean(preset));
  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <FileDown className="h-3.5 w-3.5" />
        Client document
      </Button>
      {open && (
        <ClientDocumentDialog
          open
          clientId={clientId}
          preset={preset}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) onClose?.();
          }}
        />
      )}
    </>
  );
}
