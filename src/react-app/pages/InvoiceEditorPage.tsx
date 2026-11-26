import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { ArrowLeft, FileText, Plus, Trash2 } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { DeleteInvoiceDialog } from "@/components/clients/ClientInvoicesSection";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { DatePicker } from "@/components/ui/date-picker";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/forms/Field";
import { MoneyInput } from "@/components/forms/MoneyInput";
import { SettingsHint } from "@/components/settings/SettingsHint";
import { useClient, useClientServices, useUpdateClient } from "@/hooks/useProjects";
import { useReportSettings } from "@/hooks/useReportSettings";
import { useInvoice, useSaveInvoice } from "@/hooks/useInvoices";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { api } from "@/lib/api-client";
import { toastApiError } from "@/lib/toastApiError";
import { formatMoney } from "@/lib/money";
import { CURRENCIES } from "@/lib/currency";
import { documentPresetFrom, lastMonthRange } from "@/lib/clientDocuments";
import { useClientEntriesFetcher } from "@/hooks/useClientEntriesFetcher";
import { PdfPreview } from "@/components/client-documents/PdfPreview";
import { useRenderedPdf } from "@/hooks/useRenderedPdf";
import { downloadBlob, invoiceFileName, renderInvoicePdf, type InvoiceContent } from "@/components/client-documents/invoicePdf";
import { INVOICE_NUMBER, invoiceLines, invoiceTotal, type DocumentLocale } from "@shared/client-documents";
import type { Client, ClientService, Invoice, ReportSettings } from "@shared/schemas";

const LOCALE_OPTIONS = [
  { value: "pt-BR" as const, label: "Português" },
  { value: "en" as const, label: "English" },
];

type LineKind = "hours" | "recurring" | "one_off";

interface DraftLine {
  key: string;
  kind: LineKind;
  description: string;
  hours: number | null;
  // What was typed in the quantity, so "1." or a cleared field show as typed.
  hoursText?: string;
  amount: number | null;
  // A recurring item added here: saving the invoice also saves it as one of the client's services.
  isNewService?: boolean;
}

const GROUPS: { kind: LineKind; title: string; hint: string; add?: string }[] = [
  { kind: "hours", title: "Worked hours", hint: "The period's hours, recalculated when the period or the rate changes." },
  { kind: "recurring", title: "Recurring", hint: "Billed on every invoice. One added here is saved to this client's recurring services.", add: "Add recurring item" },
  { kind: "one_off", title: "One-off", hint: "Only on this invoice.", add: "Add one-off item" },
];

const newKey = () => crypto.randomUUID();
// One column set for the header and every item row, so they line up.
const LINE_GRID = "grid grid-cols-[minmax(0,1fr)_5.5rem_8.5rem_2rem] items-center gap-2";
const day = (d: Date) => format(d, "yyyy-MM-dd");

/** Seconds tracked for the client in the period, as the PDF has always billed them. */
function useTrackedSeconds() {
  const entries = useClientEntriesFetcher();
  return async (clientId: string, from: string, to: string) =>
    (await entries.fetch(clientId, from, to)).reduce((sum, e) => sum + e.duration, 0);
}

/** `/clients/:id/invoices/new` and `/clients/:id/invoices/:invoiceId`: an invoice edited beside its live PDF. */
export function InvoiceEditorPage() {
  const { id: clientId, invoiceId } = useParams<{ id: string; invoiceId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preset = documentPresetFrom(searchParams);
  const { canManage } = useWorkspaceRole();
  const { data: client } = useClient(clientId);
  const { data: settings } = useReportSettings();
  const { data: services } = useClientServices(clientId);
  const { data: saved, isError } = useInvoice(invoiceId);
  const trackedSeconds = useTrackedSeconds();
  const period = preset ? { from: preset.from, to: preset.to } : lastMonthRange();

  // A new invoice starts from the period's hours and the billable services; loaded once, then the form owns it.
  const { data: initialSeconds } = useQuery({
    queryKey: ["invoice-editor-hours", clientId, period.from, period.to],
    queryFn: () => trackedSeconds(clientId as string, period.from, period.to),
    enabled: !!clientId && !invoiceId,
    staleTime: Infinity,
    gcTime: 0,
  });

  const back = () => navigate(`/clients/${clientId}`);

  if (!canManage || isError) {
    return (
      <div className="p-6">
        <EmptyState icon={FileText} title="Invoice not available" description="Invoices are for workspace owners and admins." />
      </div>
    );
  }

  const ready = client && settings && services && (invoiceId ? saved : initialSeconds !== undefined);
  if (!ready) {
    return (
      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <Skeleton className="h-96 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <Editor
      client={client}
      settings={settings}
      saved={saved}
      initial={
        saved
          ? undefined
          : {
              ...period,
              locale: preset?.locale ?? "pt-BR",
              number: preset?.number,
              rate: preset?.rate,
              seconds: initialSeconds as number,
              services,
            }
      }
      trackedSeconds={trackedSeconds}
      onDone={back}
    />
  );
}

function Editor({
  client,
  settings,
  saved,
  initial,
  trackedSeconds,
  onDone,
}: {
  client: Client;
  settings: ReportSettings;
  saved?: Invoice;
  initial?: { from: string; to: string; locale: DocumentLocale; number?: string; rate?: number; seconds: number; services: ClientService[] };
  trackedSeconds: (clientId: string, from: string, to: string) => Promise<number>;
  onDone: () => void;
}) {
  const save = useSaveInvoice();
  const updateClient = useUpdateClient();
  const fixedFee = client.fixedFee ?? null;
  const savedRate = fixedFee === null ? (client.rate ?? settings.defaultRate) : null;
  const today = day(new Date());

  const [locale, setLocale] = useState<DocumentLocale>(saved?.locale ?? initial?.locale ?? "pt-BR");
  const [range, setRange] = useState({ from: saved?.periodFrom ?? initial!.from, to: saved?.periodTo ?? initial!.to });
  const [number, setNumber] = useState(saved?.number ?? initial?.number ?? settings.invoiceNumber);
  const [currency, setCurrency] = useState(saved?.currency ?? client.currency ?? settings.currency);
  const [rate, setRate] = useState<number | null>(initial?.rate ?? savedRate);
  const [issueDate, setIssueDate] = useState(saved?.issueDate ?? today);
  // Text, so a cleared field stays empty on screen; empty counts as 0 days.
  const [dueDaysText, setDueDaysText] = useState(String(saved ? differenceInCalendarDays(parseISO(saved.dueDate), parseISO(saved.issueDate)) : settings.invoiceDueDays));
  const dueDays = Number(dueDaysText || 0);
  const [notes, setNotes] = useState(saved?.notes ?? "");
  // The client's own address: edited here, it is saved on the client, and saving the invoice takes it from there.
  const [clientAddress, setClientAddress] = useState(client.address ?? "");
  const [lines, setLines] = useState<DraftLine[]>(() =>
    saved
      ? saved.lines.map((l, i) => ({ ...l, key: newKey(), kind: l.kind ?? (i === 0 && l.hours !== null ? "hours" : "one_off") }))
      : invoiceLines(initial!.seconds, rate ?? 0, initial!.services, initial!.locale, fixedFee).map((l, i) => ({
          ...l,
          key: newKey(),
          // invoiceLines puts the hours line first, whenever there is one; the rest are the client's services.
          kind: i === 0 && l.hours !== null ? "hours" : "recurring",
        }))
  );
  const [busy, setBusy] = useState<false | "save" | "download">(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const dueDate = day(addDays(parseISO(issueDate), dueDays));
  // A row left completely empty is ignored; a cleared amount or quantity counts as nothing (0 / —), never as an error.
  const filled = lines.filter((l) => l.description.trim() !== "" || l.amount !== null || l.hours !== null);
  const lineValid = (l: DraftLine) =>
    l.description.trim() !== "" && !Number.isNaN(l.amount) && (l.amount ?? 0) >= 0 && (l.hours === null || Number.isFinite(l.hours));
  const valid = INVOICE_NUMBER.test(number) && range.from <= range.to && filled.length > 0 && filled.every(lineValid) && dueDays <= 365 && !Number.isNaN(rate);

  const content: InvoiceContent = {
    number,
    issueDate,
    dueDate,
    currency,
    locale,
    notes: notes.trim() || null,
    // The PDF lists the groups in the editor's order: hours, recurring, one-off.
    lines: GROUPS.flatMap((g) => filled.filter((l) => l.kind === g.kind))
      .filter(lineValid)
      .map((l) => ({ description: l.description.trim(), hours: l.hours, amount: l.amount ?? 0, kind: l.kind })),
    // Saving (new or edit) takes the client's and the company's details as they are now, so the preview shows those.
    client: { name: client.name, email: client.email, address: clientAddress.trim() || null, phone: client.phone },
    company: {
      name: settings.companyName,
      email: settings.companyEmail || null,
      address: settings.companyAddress || null,
      phone: settings.companyPhone || null,
    },
  };
  const preview = useRenderedPdf({ content, settings }, renderPreview);

  const setLine = (key: string, patch: Partial<DraftLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const changeRate = (next: number | null) => {
    setRate(next);
    if (Number.isNaN(next)) return;
    // A new key remounts the row, so its amount field shows the recomputed value.
    setLines((ls) =>
      ls.map((l) => (l.kind === "hours" && l.hours !== null ? { ...l, key: newKey(), amount: Math.round(l.hours * (next ?? 0) * 100) / 100 } : l))
    );
  };

  // A new period re-reads its hours into the hours line, leaving every other line as it was.
  const changePeriod = async (next: { from: string; to: string }) => {
    setRange(next);
    if (next.from > next.to) return;
    setRefreshing(true);
    try {
      const seconds = await trackedSeconds(client.id, next.from, next.to);
      const [hoursLine] = invoiceLines(seconds, Number.isFinite(rate) ? (rate as number) : 0, [], locale, fixedFee);
      setLines((ls) => {
        const rest = ls.filter((l) => l.kind !== "hours");
        return hoursLine ? [{ ...hoursLine, key: newKey(), kind: "hours" }, ...rest] : rest;
      });
    } catch (error) {
      toastApiError(error, "Failed to read the period's hours");
    } finally {
      setRefreshing(false);
    }
  };

  const submit = async (andDownload: boolean) => {
    if (!valid) return;
    setBusy(andDownload ? "download" : "save");
    try {
      const fields = {
        number,
        issueDate,
        dueDate,
        periodFrom: range.from,
        periodTo: range.to,
        currency,
        locale,
        lines: content.lines,
        notes: content.notes,
      };
      // Client changes first (safe to repeat), so the invoice is saved with them; a rate typed here is the client's from now on.
      const clientChange = {
        ...((clientAddress.trim() || null) !== client.address ? { address: clientAddress.trim() || null } : {}),
        ...(fixedFee === null && rate !== null && Number.isFinite(rate) && rate !== savedRate ? { rate } : {}),
      };
      if (Object.keys(clientChange).length) await updateClient.mutateAsync({ id: client.id, data: clientChange });
      const invoice = saved
        ? await save.mutateAsync({ kind: "update", id: saved.id, data: fields })
        : await save.mutateAsync({ kind: "create", data: { ...fields, clientId: client.id } });
      // From here the invoice is saved: a failure below is reported, never retried by a second Save that would duplicate it.
      try {
        // A recurring item added here becomes one of the client's services, billed on every invoice from now on.
        for (const l of filled.filter((x) => x.isNewService)) {
          await api.clients.createService(client.id, { name: l.description.trim(), amount: l.amount ?? 0, billable: true });
        }
        if (andDownload) downloadBlob(await renderInvoicePdf(invoice, settings), invoiceFileName(invoice));
      } catch (error) {
        toastApiError(error, "The invoice was saved, but a recurring item or the PDF download failed");
      }
      onDone();
    } catch (error) {
      toastApiError(error, "Failed to save the invoice");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6">
      <Button variant="ghost" size="sm" className="mb-4 gap-1.5 text-muted-foreground" onClick={onDone}>
        <ArrowLeft className="h-4 w-4" />
        {client.name}
      </Button>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">{saved ? `Invoice #${saved.number}` : "New invoice"}</h1>
        <div className="flex items-center gap-2">
          {saved && (
            <IconButton label="Delete invoice" onClick={() => setDeleting(true)}>
              <Trash2 />
            </IconButton>
          )}
          <Button variant="outline" onClick={() => submit(true)} disabled={!valid || busy !== false} className="gap-1.5">
            {busy === "download" && <Spinner />}
            <span>Save and download PDF</span>
          </Button>
          <Button onClick={() => submit(false)} disabled={!valid || busy !== false} className="gap-1.5">
            {busy === "save" && <Spinner />}
            <span>Save</span>
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4">
              <SegmentedControl label="Language" options={LOCALE_OPTIONS} value={locale} onChange={setLocale} />
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <FieldLabel htmlFor="inv-from">Period from</FieldLabel>
                  <DatePicker id="inv-from" label="From" displayFormat="dd/MM/yyyy" value={parseISO(range.from)} onSelect={(d) => changePeriod({ ...range, from: day(d) })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="inv-to">Period to</FieldLabel>
                  <DatePicker id="inv-to" label="To" displayFormat="dd/MM/yyyy" value={parseISO(range.to)} onSelect={(d) => changePeriod({ ...range, to: day(d) })} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="inv-number">Invoice number</FieldLabel>
                  <Input
                    id="inv-number"
                    inputMode="numeric"
                    placeholder="12 or 2026-09"
                    value={number}
                    aria-invalid={!INVOICE_NUMBER.test(number)}
                    onChange={(e) => setNumber(e.target.value.replace(/[^\d-]/g, ""))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="inv-currency">Currency</FieldLabel>
                  <Select value={currency} onValueChange={setCurrency}>
                    <SelectTrigger id="inv-currency" className="w-full">
                      <SelectValue>{currency}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="inv-issue">Issue date</FieldLabel>
                  <DatePicker id="inv-issue" label="Issue date" displayFormat="dd/MM/yyyy" value={parseISO(issueDate)} onSelect={(d) => setIssueDate(day(d))} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="inv-due">Due date</FieldLabel>
                  <DatePicker
                    id="inv-due"
                    label="Due date"
                    displayFormat="dd/MM/yyyy"
                    value={parseISO(dueDate)}
                    onSelect={(d) => setDueDaysText(String(Math.max(0, differenceInCalendarDays(d, parseISO(issueDate)))))}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="inv-due-days">Payment term (days)</FieldLabel>
                  <Input
                    id="inv-due-days"
                    inputMode="numeric"
                    placeholder="0"
                    value={dueDaysText}
                    aria-invalid={dueDays > 365}
                    onChange={(e) => setDueDaysText(e.target.value.replace(/\D/g, "").slice(0, 3))}
                  />
                </Field>
                {savedRate !== null && (
                  <Field>
                    <FieldLabel htmlFor="inv-rate">Hourly rate</FieldLabel>
                    <MoneyInput key={currency} id="inv-rate" currency={currency} value={rate} onValueChange={changeRate} />
                  </Field>
                )}
              </div>
              <SettingsHint>
                {fixedFee !== null
                  ? `Fixed fee of ${formatMoney(fixedFee, currency)} for the hours (Edit on the client page).`
                  : "A rate typed here becomes this client's rate. The payment term is remembered for the next invoice."}
              </SettingsHint>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <h2 className="text-sm font-semibold">Billed to</h2>
              <p className="text-sm">{client.name}</p>
              <Field>
                <FieldLabel htmlFor="inv-client-address">Client address</FieldLabel>
                <Textarea
                  id="inv-client-address"
                  rows={3}
                  value={clientAddress}
                  placeholder="Street, number, city, state, ZIP"
                  onChange={(e) => setClientAddress(e.target.value)}
                />
              </Field>
              <SettingsHint>Saved on the client, so every invoice for it uses this address. Your company's address is in Settings → Reports.</SettingsHint>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Items</h2>
                {refreshing && <Spinner />}
              </div>
              {GROUPS.map((g) => {
                const rows = lines.filter((l) => l.kind === g.kind);
                // The hours group exists only while there is an hours line.
                if (!g.add && rows.length === 0) return null;
                return (
                  <section key={g.kind} aria-label={g.title} className="space-y-2 border-t pt-4 first-of-type:border-t-0 first-of-type:pt-0">
                    <div>
                      <h3 className="text-sm font-medium">{g.title}</h3>
                      <p className="text-xs text-muted-foreground">{g.hint}</p>
                    </div>
                    {rows.length > 0 && (
                      <div className={LINE_GRID + " px-1 text-xs text-muted-foreground"} aria-hidden>
                        <span>Description</span>
                        <span>Qty / Hrs</span>
                        <span>Amount</span>
                        <span />
                      </div>
                    )}
                    {rows.map((l) => (
                      <div key={l.key} className={LINE_GRID}>
                        <Input
                          aria-label={`${g.title} item description`}
                          placeholder="Description"
                          value={l.description}
                          aria-invalid={l.description.trim() === "" && (l.amount !== null || l.hours !== null)}
                          onChange={(e) => setLine(l.key, { description: e.target.value })}
                        />
                        <Input
                          id={`line-hours-${l.key}`}
                          aria-label="Quantity or hours"
                          inputMode="decimal"
                          placeholder="—"
                          value={l.hoursText ?? (l.hours === null ? "" : String(l.hours))}
                          aria-invalid={l.hours !== null && !Number.isFinite(l.hours)}
                          onChange={(e) => {
                            const v = e.target.value.replace(",", ".").replace(/[^\d.]/g, "");
                            setLine(l.key, { hours: v === "" ? null : Number(v), hoursText: v });
                          }}
                        />
                        <MoneyInput key={currency} id={`line-amount-${l.key}`} aria-label="Amount" currency={currency} value={l.amount} onValueChange={(amount) => setLine(l.key, { amount })} />
                        <IconButton label="Remove item" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                          <Trash2 />
                        </IconButton>
                      </div>
                    ))}
                    {g.add && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        onClick={() =>
                          setLines((ls) => [...ls, { key: newKey(), kind: g.kind, description: "", hours: null, amount: null, isNewService: g.kind === "recurring" }])
                        }
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {g.add}
                      </Button>
                    )}
                  </section>
                );
              })}
              <div className="flex justify-end gap-3 border-t pt-3 text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-semibold tabular-nums">{formatMoney(invoiceTotal(content.lines), currency)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Field>
                <FieldLabel htmlFor="inv-notes">Notes</FieldLabel>
                <Textarea id="inv-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Payment instructions, a thank-you note…" />
              </Field>
            </CardContent>
          </Card>
        </div>

        <PdfPreview blob={preview} className="h-[80dvh] lg:sticky lg:top-6 lg:h-[calc(100dvh-7rem)]" />
      </div>
      {saved && <DeleteInvoiceDialog invoice={deleting ? saved : null} onClose={() => setDeleting(false)} onDeleted={onDone} />}
    </div>
  );
}

const renderPreview = ({ content, settings }: { content: InvoiceContent; settings: ReportSettings }) => renderInvoicePdf(content, settings);
