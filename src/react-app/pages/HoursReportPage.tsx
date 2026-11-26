import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldLabel } from "@/components/forms/Field";
import { SettingsHint } from "@/components/settings/SettingsHint";
import { PdfPreview } from "@/components/client-documents/PdfPreview";
import { useRenderedPdf } from "@/hooks/useRenderedPdf";
import { hoursReportFileName, renderHoursReportPdf } from "@/components/client-documents/hoursReportPdf";
import { downloadBlob } from "@/components/client-documents/invoicePdf";
import { useClient } from "@/hooks/useProjects";
import { useReportSettings } from "@/hooks/useReportSettings";
import { useWorkspaceRole } from "@/hooks/useWorkspaceRole";
import { useClientEntriesFetcher } from "@/hooks/useClientEntriesFetcher";
import { documentPresetFrom, formatClock, lastMonthRange, localDay } from "@/lib/clientDocuments";
import { toastApiError } from "@/lib/toastApiError";
import { hoursSummary, type DocumentLocale } from "@shared/client-documents";

const LOCALE_OPTIONS = [
  { value: "pt-BR" as const, label: "Português" },
  { value: "en" as const, label: "English" },
];

const day = (d: Date) => format(d, "yyyy-MM-dd");

/** `/clients/:id/hours-report`: the worked-hours report for a period, beside its live PDF. */
export function HoursReportPage() {
  const { id: clientId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const preset = documentPresetFrom(searchParams);
  const { canManage } = useWorkspaceRole();
  const { data: client } = useClient(clientId);
  const { data: settings } = useReportSettings();
  const entriesFetcher = useClientEntriesFetcher();
  const [locale, setLocale] = useState<DocumentLocale>(preset?.locale ?? "pt-BR");
  const [range, setRange] = useState(() => (preset ? { from: preset.from, to: preset.to } : lastMonthRange()));
  const [busy, setBusy] = useState(false);
  const validRange = range.from <= range.to;

  const { data: entries, isFetching } = useQuery({
    queryKey: ["hours-report", clientId, range.from, range.to, entriesFetcher.roundingKey],
    queryFn: () => entriesFetcher.fetch(clientId as string, range.from, range.to),
    enabled: !!clientId && validRange,
    // The previous period stays on screen while the next one loads, so the preview never empties.
    placeholderData: keepPreviousData,
  });

  const input = client && settings && entries ? { clientName: client.name, locale, from: range.from, to: range.to, entries, settings } : null;
  const blob = useRenderedPdf(input, renderHoursReportPdf);
  const summary = entries ? hoursSummary(entries, localDay) : null;

  const download = async () => {
    if (!input) return;
    setBusy(true);
    try {
      downloadBlob(await renderHoursReportPdf(input), hoursReportFileName(input));
    } catch (error) {
      toastApiError(error, "Failed to generate the PDF");
    } finally {
      setBusy(false);
    }
  };

  if (!client || !settings) {
    return (
      <div className="grid gap-6 p-6 lg:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6">
      <Button variant="ghost" size="sm" className="mb-4 gap-1.5 text-muted-foreground" onClick={() => navigate(`/clients/${client.id}`)}>
        <ArrowLeft className="h-4 w-4" />
        {client.name}
      </Button>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Hours report</h1>
        <Button onClick={download} disabled={!input || !validRange || busy} className="gap-1.5">
          {busy && <Spinner />}
          <span>Download PDF</span>
        </Button>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardContent className="space-y-4">
            <SegmentedControl label="Language" options={LOCALE_OPTIONS} value={locale} onChange={setLocale} />
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="hr-from">From</FieldLabel>
                <DatePicker id="hr-from" label="From" displayFormat="dd/MM/yyyy" value={parseISO(range.from)} onSelect={(d) => setRange((r) => ({ ...r, from: day(d) }))} />
              </Field>
              <Field>
                <FieldLabel htmlFor="hr-to">To</FieldLabel>
                <DatePicker id="hr-to" label="To" displayFormat="dd/MM/yyyy" value={parseISO(range.to)} onSelect={(d) => setRange((r) => ({ ...r, to: day(d) }))} />
              </Field>
            </div>
            {!validRange && <SettingsHint>The start date is after the end date.</SettingsHint>}
            {summary && validRange && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{`${summary.entryCount} entries · ${formatClock(summary.totalSeconds)} total`}</span>
                {isFetching && <Spinner />}
              </p>
            )}
            {/* A member's reports hold only their own hours (D3); owners/admins get the whole team's. */}
            {!canManage && <SettingsHint>This report includes only the hours you logged.</SettingsHint>}
          </CardContent>
        </Card>

        <PdfPreview blob={blob} className="h-[80dvh] lg:sticky lg:top-6 lg:h-[calc(100dvh-7rem)]" />
      </div>
    </div>
  );
}
