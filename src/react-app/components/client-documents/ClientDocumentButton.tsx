import { useState } from "react";
import { FileClock, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ClientDocumentDialog } from "./ClientDocumentDialog";
import type { DocumentPreset } from "@/lib/clientDocuments";
import type { ClientDocumentKind } from "@shared/client-documents";

// Plural where the button serves every client (Reports), singular on one client.
const KIND = {
  invoice: { one: "Invoice", all: "Invoices", icon: FileText },
  hours: { one: "Hours report", all: "Hours reports", icon: FileClock },
} as const;

/**
 * Opens the invoice or hours-report generator; `clientId` fixes the client.
 * A `preset` of this kind (from a link) opens it straight away, filled in; `onClose` lets the page drop that link.
 */
export function ClientDocumentButton({
  kind,
  clientId,
  preset,
  onClose,
}: {
  kind: ClientDocumentKind;
  clientId?: string;
  preset?: DocumentPreset | null;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(preset?.kind === kind);
  const { one, all, icon: Icon } = KIND[kind];
  const label = clientId ? one : all;
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size="icon-sm" variant="ghost" aria-label={label} onClick={() => setOpen(true)}>
            <Icon className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
      {open && (
        <ClientDocumentDialog
          open
          kind={kind}
          clientId={clientId}
          preset={preset?.kind === kind ? preset : null}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) onClose?.();
          }}
        />
      )}
    </>
  );
}
