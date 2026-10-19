import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { endOfMonth, format, parseISO, startOfMonth, subMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useClients, useUpdateClient } from "@/hooks/useProjects";
import { useReportSettings } from "@/hooks/useReportSettings";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { api } from "@/lib/api-client";
import { toastApiError } from "@/lib/toastApiError";
import { formatMoney } from "@/lib/money";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { Field, FieldLabel } from "@/components/forms/Field";
import { SettingsHint } from "@/components/settings/SettingsHint";
import { useUIStore } from "@/stores/uiStore";
import {
  DOCUMENT_TEXT,
  INVOICE_NUMBER,
  invoiceLines,
  type ClientDocumentKind,
  type DocumentLocale,
} from "@shared/client-documents";
import {
  formatDay,
  formatMonth,
  type DocumentPreset,
} from "@/lib/clientDocuments";
import { brandPalette } from "./brand";

const LOCALE_OPTIONS = [
  { value: "pt-BR" as const, label: "Português" },
  { value: "en" as const, label: "English" },
];

function lastMonth() {
  const m = subMonths(new Date(), 1);
  return { from: format(startOfMonth(m), "yyyy-MM-dd"), to: format(endOfMonth(m), "yyyy-MM-dd") };
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Generates a client's invoice or hours report as a PDF; `clientId` fixes the client (opened from its page). */
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
  const updateClient = useUpdateClient();
  const { data: settings } = useReportSettings();
  const queryClient = useQueryClient();
  const { canManage } = useWorkspaceRole();
  const roundMode = useUIStore((s) => s.roundMode);
  const roundMinutes = useUIStore((s) => s.roundMinutes);

  const [clientId, setClientId] = useState(fixedClientId ?? "");
  const [locale, setLocale] = useState<DocumentLocale>(preset?.locale ?? "pt-BR");
  const [{ from, to }, setRange] = useState(() => (preset ? { from: preset.from, to: preset.to } : lastMonth()));
  // Untouched: the link's number, else the workspace's next one.
  const [typedNumber, setNumber] = useState(preset?.number);
  const number = typedNumber ?? settings?.nextInvoiceNumber ?? "";
  // Untouched (undefined): the client's rate, else the workspace default. Typed: saved on the client when generating.
  const [rateOverride, setRateOverride] = useState<number | null | undefined>(preset?.rate);
  const [busy, setBusy] = useState(false);

  const client = clients.find((c) => c.id === (fixedClientId ?? clientId));
  const savedRate = client && settings ? (client.rate ?? settings.defaultRate) : null;
  const rate = rateOverride === undefined ? savedRate : rateOverride;
  // The client's own currency, like its rate, wins over the workspace's.
  const currency = client?.currency ?? settings?.currency ?? "";
  const validRate = kind === "hours" || (rate !== null && rate >= 0);
  const validRange = from !== "" && to !== "" && from <= to;
  const canGenerate = Boolean(client && settings && validRange && validRate && (kind === "hours" || INVOICE_NUMBER.test(number)) && !busy);

  const generate = async () => {
    if (!client || !settings) return;
    setBusy(true);
    try {
      // A rate typed here is the client's rate from now on, as if it had been edited on the client.
      if (kind === "invoice" && rate !== null && rate !== client.rate && rateOverride !== undefined) {
        await updateClient.mutateAsync({ id: client.id, data: { rate } });
      }
      const rounded = roundMode !== "off" && roundMinutes > 0;
      const [entries, services, render] = await Promise.all([
        api.reports.detailed({
          since: new Date(`${from}T00:00:00`).toISOString(),
          until: new Date(`${to}T23:59:59.999`).toISOString(),
          clientIds: client.id,
          roundMode: rounded ? roundMode : undefined,
          roundMinutes: rounded ? String(roundMinutes) : undefined,
        }),
        kind === "invoice" ? api.clients.services(client.id) : Promise.resolve([]),
        import("./generate"),
      ]);
      const t = DOCUMENT_TEXT[locale];
      // The renderer fetches the logo itself; same origin, so the session cookie goes with it.
      const logo = settings.logoUrl && new URL(settings.logoUrl, window.location.origin).href;
      const common = { locale, palette: brandPalette(settings.colors), logo, companyName: settings.companyName };

      if (kind === "invoice") {
        const totalSeconds = entries.reduce((sum, e) => sum + e.duration, 0);
        const blob = await render.renderInvoice({
          ...common,
          companyEmail: settings.companyEmail,
          clientName: client.name,
          number,
          issueDate: formatDay(new Date().toISOString(), locale),
          lines: invoiceLines(totalSeconds, rate ?? 0, services, locale),
          currency,
        });
        download(blob, t.invoiceFile(client.name, number));
        queryClient.setQueryData(["report-settings"], await api.reportSettings.recordInvoiceNumber(number));
      } else {
        // A period inside one month is named by the month; any other by its two dates.
        const oneMonth = from.slice(0, 7) === to.slice(0, 7);
        const periodLabel = `${formatDay(`${from}T12:00:00`, locale)} – ${formatDay(`${to}T12:00:00`, locale)}`;
        const blob = await render.renderHoursReport({
          ...common,
          clientName: client.name,
          periodLabel,
          sectionTitle: oneMonth ? t.entriesOf(formatMonth(from, locale)) : t.entries,
          entries,
        });
        download(blob, t.hoursFile(client.name, oneMonth ? formatMonth(from, locale) : `${from} - ${to}`));
      }
      onOpenChange(false);
    } catch (error) {
      toastApiError(error, "Failed to generate the PDF");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{kind === "invoice" ? "Invoice" : "Hours report"}</DialogTitle>
          <DialogDescription>
            {kind === "invoice" ? "What the client is billed for the period" : "The hours worked for the client in the period"}, as a PDF with your report branding.
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
                  setRateOverride(undefined);
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

          <SegmentedControl label="Language" options={LOCALE_OPTIONS} value={locale} onChange={setLocale} />

          <div className="flex gap-3">
            <Field className="flex-1">
              <FieldLabel htmlFor="doc-from">From</FieldLabel>
              <DatePicker id="doc-from" label="From" displayFormat="dd/MM/yyyy" value={parseISO(from)} onSelect={(d) => setRange((r) => ({ ...r, from: format(d, "yyyy-MM-dd") }))} />
            </Field>
            <Field className="flex-1">
              <FieldLabel htmlFor="doc-to">To</FieldLabel>
              <DatePicker id="doc-to" label="To" displayFormat="dd/MM/yyyy" value={parseISO(to)} onSelect={(d) => setRange((r) => ({ ...r, to: format(d, "yyyy-MM-dd") }))} />
            </Field>
          </div>

          {kind === "invoice" && (
            // Same two-column row as From / To above.
            <div className="space-y-1.5">
              <div className="flex gap-3">
                <Field className="flex-1">
                  <FieldLabel htmlFor="doc-number">Invoice number</FieldLabel>
                  <Input
                    id="doc-number"
                    inputMode="numeric"
                    placeholder="12 or 2026-09"
                    value={number}
                    aria-invalid={!INVOICE_NUMBER.test(number)}
                    // Digits and hyphens only; the next invoice continues this one's pattern.
                    onChange={(e) => setNumber(e.target.value.replace(/[^\d-]/g, ""))}
                  />
                </Field>
                {client && settings && savedRate !== null && (
                  <Field className="flex-1">
                    <FieldLabel htmlFor="doc-rate">Hourly rate</FieldLabel>
                    <MoneyInput
                      // Another client brings its own rate and currency back into the field.
                      key={`${client.id}:${currency}`}
                      id="doc-rate"
                      currency={currency}
                      value={rate}
                      onValueChange={setRateOverride}
                    />
                  </Field>
                )}
              </div>
              {client && settings && savedRate !== null && (
                <SettingsHint>
                  {rateOverride !== undefined && rateOverride !== savedRate
                    ? `Saved as this client's rate when you generate (now ${formatMoney(savedRate, currency)}).`
                    : client.rate === null
                      ? "The workspace default (Settings → Reports)."
                      : "This client's rate (Edit on the client page)."}
                </SettingsHint>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={generate} disabled={!canGenerate} className="gap-1.5">
            {busy && <Spinner />}
            Generate PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
