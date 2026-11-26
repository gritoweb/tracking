import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClients } from "@/hooks/useProjects";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { Field, FieldLabel } from "@/components/forms/Field";
import { SettingsHint } from "@/components/settings/SettingsHint";
import {
  type ClientDocumentKind,
  type DocumentLocale,
} from "@shared/client-documents";
import { DOCUMENT_LOCALE_OPTIONS, lastMonthRange, type DocumentPreset } from "@/lib/clientDocuments";
import { dateToLocalDate } from "@/lib/taskUtils";



/** Picks the client, period and language of an invoice or hours report and opens its screen; `clientId` fixes the client. */
export function ClientDocumentDialog({
  open,
  kind,
  onOpenChange,
  clientId: fixedClientId,
  preset,
}: {
  open: boolean;
  kind: ClientDocumentKind;
  onOpenChange: (open: boolean) => void;
  clientId?: string;
  preset?: DocumentPreset | null;
}) {
  const { data: clients = [] } = useClients();
  const navigate = useNavigate();
  const { canManage } = useWorkspaceRole();

  const [clientId, setClientId] = useState(fixedClientId ?? "");
  const [locale, setLocale] = useState<DocumentLocale>(preset?.locale ?? "pt-BR");
  const [{ from, to }, setRange] = useState(() => (preset ? { from: preset.from, to: preset.to } : lastMonthRange()));

  const client = clients.find((c) => c.id === (fixedClientId ?? clientId));
  const validRange = from !== "" && to !== "" && from <= to;
  const canGenerate = Boolean(client && validRange);

  // Both documents are reviewed beside their live PDF on their own screen; this dialog only picks what goes in.
  const generate = () => {
    if (!client) return;
    const params = new URLSearchParams({ document: kind, from, to, lang: locale });
    navigate(`/clients/${client.id}/${kind === "invoice" ? "invoices/new" : "hours-report"}?${params}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{kind === "invoice" ? "Invoice" : "Hours report"}</DialogTitle>
          <DialogDescription>
            {kind === "invoice" ? "Choose the client and period; you review and edit the invoice on the next screen." : "Choose the client and period; you preview and download the report on the next screen."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!fixedClientId && (
            <Field>
              <FieldLabel htmlFor="doc-client">Client</FieldLabel>
              <Select
                value={clientId}
                onValueChange={(id) => {
                  setClientId(id);
                }}
              >
                <SelectTrigger id="doc-client" className="w-full">
                  <SelectValue placeholder="Choose a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}

          {/* A member's reports hold only their own hours (D3); owners/admins get the whole team's. */}
          {kind === "hours" && !canManage && (
            <SettingsHint>This report includes only the hours you logged.</SettingsHint>
          )}

          <SegmentedControl label="Language" options={DOCUMENT_LOCALE_OPTIONS} value={locale} onChange={setLocale} />

          <div className="flex gap-3">
            <Field className="flex-1">
              <FieldLabel htmlFor="doc-from">From</FieldLabel>
              <DatePicker id="doc-from" label="From" displayFormat="dd/MM/yyyy" value={parseISO(from)} onSelect={(d) => setRange((r) => ({ ...r, from: dateToLocalDate(d) }))} />
            </Field>
            <Field className="flex-1">
              <FieldLabel htmlFor="doc-to">To</FieldLabel>
              <DatePicker id="doc-to" label="To" displayFormat="dd/MM/yyyy" value={parseISO(to)} onSelect={(d) => setRange((r) => ({ ...r, to: dateToLocalDate(d) }))} />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={generate} disabled={!canGenerate} className="gap-1.5">
            Continue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
