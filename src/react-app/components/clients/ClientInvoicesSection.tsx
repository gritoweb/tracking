import { Fragment, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, Edit2, Eye, FileText, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { SettingsCardHeader } from "@/components/settings/SettingsCardHeader";
import { PdfPreview } from "@/components/client-documents/PdfPreview";
import { useRenderedPdf } from "@/hooks/useRenderedPdf";
import { useClientInvoices, useDeleteInvoice } from "@/hooks/useInvoices";
import { useReportSettings } from "@/hooks/useReportSettings";
import { formatMoney } from "@/lib/money";
import { toastApiError } from "@/lib/toastApiError";
import { downloadBlob, invoiceFileName, renderInvoicePdf } from "@/components/client-documents/invoicePdf";
import type { Invoice, ReportSettings } from "@shared/schemas";

/** "November 2026": the heading of an invoice's issue month. */
function monthLabel(issueDate: string): string {
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(new Date(`${issueDate}T12:00:00`));
}

const shortDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

const renderSaved = ({ invoice, settings }: { invoice: Invoice; settings: ReportSettings }) => renderInvoicePdf(invoice, settings);

/** Download, edit and delete for one saved invoice: the same icons in the list row and in the viewer. */
function InvoiceActions({
  invoice,
  settings,
  onEdit,
  onDelete,
}: {
  invoice: Invoice;
  settings: ReportSettings | undefined;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    if (!settings) return;
    setBusy(true);
    try {
      downloadBlob(await renderInvoicePdf(invoice, settings), invoiceFileName(invoice));
    } catch (error) {
      toastApiError(error, "Failed to render the PDF");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <IconButton label="Download PDF" disabled={busy || !settings} onClick={download}>
        <Download />
      </IconButton>
      <IconButton label="Edit invoice" onClick={onEdit}>
        <Edit2 />
      </IconButton>
      <IconButton label="Delete invoice" onClick={onDelete}>
        <Trash2 />
      </IconButton>
    </>
  );
}

/** The confirmation every invoice delete goes through: the list, the viewer and the editor. */
export function DeleteInvoiceDialog({ invoice, onClose, onDeleted }: { invoice: Invoice | null; onClose: () => void; onDeleted?: () => void }) {
  const remove = useDeleteInvoice();
  return (
    <ConfirmDialog
      open={invoice !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Delete this invoice?"
      description={`Invoice #${invoice?.number ?? ""} will be removed from this client's records. Tracked time is not affected.`}
      confirmLabel="Delete"
      onConfirm={() => {
        // mutateAsync: the asking screen may unmount before the answer; a failure is already toasted by the hook.
        if (invoice) remove.mutateAsync(invoice.id).then(onDeleted, () => {});
        onClose();
      }}
    />
  );
}

/** A saved invoice, read-only, in the same preview the editor uses. */
function InvoiceViewer({
  invoice,
  settings,
  onClose,
  onEdit,
  onDelete,
}: {
  invoice: Invoice;
  settings: ReportSettings;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const blob = useRenderedPdf({ invoice, settings }, renderSaved);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="viewer" className="sm:max-w-5xl">
        <div className="shrink-0 px-6 pt-5 pr-14 pb-3">
          <DialogTitle>{`Invoice #${invoice.number}`}</DialogTitle>
          <DialogDescription>{`${formatMoney(invoice.total, invoice.currency)} · due ${shortDay(invoice.dueDate)}`}</DialogDescription>
        </div>
        <PdfPreview
          blob={blob}
          className="flex-1 rounded-none"
          actions={<InvoiceActions invoice={invoice} settings={settings} onEdit={onEdit} onDelete={onDelete} />}
        />
      </DialogContent>
    </Dialog>
  );
}

/** A client's saved invoices by month — the record of what was billed, whatever the hours or rates say today. */
export function ClientInvoicesSection({ clientId }: { clientId: string }) {
  const navigate = useNavigate();
  const { data: invoices = [] } = useClientInvoices(clientId);
  const { data: settings } = useReportSettings();
  const [removing, setRemoving] = useState<Invoice | null>(null);
  const [viewing, setViewing] = useState<Invoice | null>(null);
  const edit = (inv: Invoice) => navigate(`/clients/${clientId}/invoices/${inv.id}`);

  const months = new Map<string, Invoice[]>();
  for (const inv of invoices) {
    const key = inv.issueDate.slice(0, 7);
    months.set(key, [...(months.get(key) ?? []), inv]);
  }

  return (
    <Card className="mt-8">
      <SettingsCardHeader
        className="px-4"
        icon={FileText}
        title="Invoices"
        action={
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate(`/clients/${clientId}/invoices/new`)}>
            <Plus className="h-3.5 w-3.5" />
            New invoice
          </Button>
        }
      />
      <CardContent className="space-y-5 px-4">
        {invoices.length === 0 ? (
          <EmptyState icon={FileText} title="No invoices yet" description="Every invoice you save is kept here, by month, with the exact amounts it was sent with." />
        ) : (
          [...months].map(([key, list]) => (
            <div key={key}>
              <h3 className="mb-1 pl-6 text-xs font-medium text-muted-foreground">{monthLabel(list[0].issueDate)}</h3>
              <ItemGroup>
                {list.map((inv, i) => (
                  <Fragment key={inv.id}>
                    {i > 0 && <ItemSeparator />}
                    <Item size="sm" className="border-0 pr-0 pl-6">
                      <ItemContent>
                        <ItemTitle>
                          #{inv.number} · {formatMoney(inv.total, inv.currency)}
                        </ItemTitle>
                        <ItemDescription>
                          {`Issued ${shortDay(inv.issueDate)} · due ${shortDay(inv.dueDate)} · period ${shortDay(inv.periodFrom)} – ${shortDay(inv.periodTo)}`}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <IconButton label="View invoice" disabled={!settings} onClick={() => setViewing(inv)}>
                          <Eye />
                        </IconButton>
                        <InvoiceActions invoice={inv} settings={settings} onEdit={() => edit(inv)} onDelete={() => setRemoving(inv)} />
                      </ItemActions>
                    </Item>
                  </Fragment>
                ))}
              </ItemGroup>
            </div>
          ))
        )}
      </CardContent>

      {viewing && settings && (
        <InvoiceViewer
          invoice={viewing}
          settings={settings}
          onClose={() => setViewing(null)}
          onEdit={() => edit(viewing)}
          onDelete={() => setRemoving(viewing)}
        />
      )}
      <DeleteInvoiceDialog invoice={removing} onClose={() => setRemoving(null)} onDeleted={() => setViewing(null)} />
    </Card>
  );
}
