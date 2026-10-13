import { useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientDocumentDialog } from "./ClientDocumentDialog";

/** Opens the client PDF generator; `clientId` fixes the client when shown on its page. */
export function ClientDocumentButton({ clientId }: { clientId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <FileDown className="h-3.5 w-3.5" />
        Client document
      </Button>
      {open && <ClientDocumentDialog open onOpenChange={setOpen} clientId={clientId} />}
    </>
  );
}
