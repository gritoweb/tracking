import { lazy, Suspense, useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

// The dialog (and the PDF renderer behind it) loads on first open, not with the page.
const ClientDocumentDialog = lazy(() =>
  import("./ClientDocumentDialog").then((m) => ({ default: m.ClientDocumentDialog }))
);

/** Opens the client PDF generator; `clientId` fixes the client when shown on its page. */
export function ClientDocumentButton({ clientId }: { clientId?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setOpen(true)}>
        <FileDown className="h-3.5 w-3.5" />
        Client document
      </Button>
      {open && (
        <Suspense fallback={null}>
          <ClientDocumentDialog open onOpenChange={setOpen} clientId={clientId} />
        </Suspense>
      )}
    </>
  );
}
