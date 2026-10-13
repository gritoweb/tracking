import { useState } from "react";
import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useClients } from "@/hooks/useProjects";
import { useReportSettings } from "@/hooks/useReportSettings";
import { api } from "@/lib/api-client";
import { toastApiError } from "@/lib/toastApiError";
import { formatMoney } from "@/lib/money";
import { useUIStore } from "@/stores/uiStore";
import {
  DOCUMENT_TEXT,
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

const KIND_OPTIONS = [
  { value: "invoice" as const, label: "Invoice" },
  { value: "hours" as const, label: "Hours report" },
];
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
  onOpenChange,
  clientId: fixedClientId,
  preset,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId?: string;
  preset?: DocumentPreset | null;
}) {
  const { data: clients = [] } = useClients();
  const { data: settings } = useReportSettings();
  const roundMode = useUIStore((s) => s.roundMode);
  const roundMinutes = useUIStore((s) => s.roundMinutes);

  const [clientId, setClientId] = useState(fixedClientId ?? "");
  const [kind, setKind] = useState<ClientDocumentKind>(preset?.kind ?? "invoice");
  const [locale, setLocale] = useState<DocumentLocale>(preset?.locale ?? "pt-BR");
  const [{ from, to }, setRange] = useState(() => (preset ? { from: preset.from, to: preset.to } : lastMonth()));
  const [number, setNumber] = useState(() => preset?.number ?? (preset?.from ?? lastMonth().from).slice(0, 7));
  const [busy, setBusy] = useState(false);

  const client = clients.find((c) => c.id === (fixedClientId ?? clientId));
  const validRange = from !== "" && to !== "" && from <= to;
  const canGenerate = Boolean(client && settings && validRange && !busy);

  const changeFrom = (value: string) => {
    setRange((r) => ({ ...r, from: value }));
    // The suggested number is the period's year-month.
    if (value) setNumber(value.slice(0, 7));
  };

  const generate = async () => {
    if (!client || !settings) return;
    setBusy(true);
    try {
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
          lines: invoiceLines(totalSeconds, client.rate ?? settings.defaultRate, services, locale),
          currency: settings.currency,
        });
        download(blob, t.invoiceFile(client.name, number));
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
          <DialogTitle>Client document</DialogTitle>
          <DialogDescription>A PDF to send to the client, with your report branding.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {!fixedClientId && (
            <div className="space-y-1.5">
              <Label htmlFor="doc-client">Client</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger id="doc-client" className="w-full">
                  <SelectValue placeholder="Choose a client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <SegmentedControl label="Document" options={KIND_OPTIONS} value={kind} onChange={setKind} />
            <SegmentedControl label="Language" options={LOCALE_OPTIONS} value={locale} onChange={setLocale} />
          </div>

          <div className="flex gap-3">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="doc-from">From</Label>
              <Input id="doc-from" type="date" value={from} max={to} onChange={(e) => changeFrom(e.target.value)} />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="doc-to">To</Label>
              <Input id="doc-to" type="date" value={to} min={from} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} />
            </div>
          </div>

          {kind === "invoice" && (
            <div className="space-y-1.5">
              <Label htmlFor="doc-number">Invoice number</Label>
              <Input id="doc-number" value={number} onChange={(e) => setNumber(e.target.value)} className="w-40" />
              {client && settings && (
                <p className="text-xs text-muted-foreground">
                  Billed at {formatMoney(client.rate ?? settings.defaultRate, settings.currency)}/h
                  {client.rate === null ? " (workspace default)" : " (client rate)"}
                </p>
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
