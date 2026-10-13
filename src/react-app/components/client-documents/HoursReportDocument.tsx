import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  DOCUMENT_TEXT,
  hoursSummary,
  type DocumentLocale,
} from "@shared/client-documents";
import {
  formatClock,
  formatDay,
  formatHoursDecimal,
  localDay,
} from "@/lib/clientDocuments";
import type { ReportDetailedEntry } from "@shared/schemas";
import type { BrandPalette } from "./brand";

export interface HoursReportProps {
  locale: DocumentLocale;
  palette: BrandPalette;
  logo: string | null;
  companyName: string;
  clientName: string;
  periodLabel: string;
  sectionTitle: string;
  entries: ReportDetailedEntry[];
}

const GUTTER = 40;

export function HoursReportDocument(p: HoursReportProps) {
  const t = DOCUMENT_TEXT[p.locale];
  const s = styles(p.palette);
  const summary = hoursSummary(p.entries, localDay);
  const header = (
    <View style={s.th} fixed>
      <Text style={[s.thText, s.colDesc]}>{t.description.toUpperCase()}</Text>
      <Text style={[s.thText, s.colDur]}>{t.duration.toUpperCase()}</Text>
      <Text style={[s.thText, s.colProject]}>{t.project.toUpperCase()}</Text>
      <Text style={[s.thText, s.colDate]}>{t.date.toUpperCase()}</Text>
    </View>
  );

  return (
    <Document title={`${t.hoursTitle} — ${p.clientName}`} author={p.companyName}>
      <Page size="A4" style={s.page}>
        <View style={s.top}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{t.hoursTitle}</Text>
            <Text style={s.client}>{p.clientName}</Text>
            <Text style={s.period}>{p.periodLabel}</Text>
          </View>
          {p.logo ? <Image src={p.logo} style={s.logo} /> : <Text style={s.brandName}>{p.companyName}</Text>}
        </View>
        <View style={s.stripe} />

        <View style={s.summary}>
          <View style={s.metric}>
            <Text style={s.metricLabel}>{t.totalHours}</Text>
            <Text style={s.metricValue}>{formatClock(summary.totalSeconds)}</Text>
          </View>
          <View style={[s.metric, s.metricDivider]}>
            <Text style={s.metricLabel}>{t.entries}</Text>
            <Text style={s.metricValue}>{summary.entryCount}</Text>
          </View>
          <View style={[s.metric, s.metricDivider]}>
            <Text style={s.metricLabel}>{t.dailyAverage}</Text>
            <Text style={s.metricValue}>
              {formatHoursDecimal(summary.dailyAverageHours, p.locale)} <Text style={s.unit}>{t.hoursUnit}</Text>
            </Text>
          </View>
        </View>

        <Text style={s.section}>{p.sectionTitle}</Text>
        {/* Inside one wrapping View, the fixed header repeats on every page the table reaches. */}
        <View>
        {header}
        {p.entries.map((e) => (
          <View key={e.id} style={s.row} wrap={false}>
            <Text style={[s.cell, s.colDesc]}>{e.description || "—"}</Text>
            <Text style={[s.cell, s.colDur]}>{formatClock(e.duration)}</Text>
            <View style={[s.colProject, s.project]}>
              <View style={[s.dot, { backgroundColor: e.projectColor ?? p.palette.primary }]} />
              <Text style={s.cell}>{e.projectName ?? "—"}</Text>
            </View>
            <Text style={[s.cell, s.colDate]}>{formatDay(e.start, p.locale)}</Text>
          </View>
        ))}
        </View>

        <View style={s.footer} fixed>
          <Text>{p.companyName}</Text>
          <Text render={({ pageNumber, totalPages }) => t.page(pageNumber, totalPages)} />
        </View>
      </Page>
    </Document>
  );
}

function styles(c: BrandPalette) {
  return StyleSheet.create({
    page: { fontFamily: "Helvetica", fontSize: 10, color: c.text, paddingTop: 36, paddingBottom: 56, paddingHorizontal: GUTTER },
    top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 },
    title: { fontFamily: "Helvetica-Bold", fontSize: 17, color: c.primary },
    client: { fontFamily: "Helvetica-Bold", fontSize: 12, marginTop: 6 },
    period: { fontSize: 9.5, color: c.muted, marginTop: 4 },
    logo: { height: 38, maxWidth: 160, objectFit: "contain", marginLeft: 16 },
    brandName: { fontFamily: "Helvetica-Bold", fontSize: 13, color: c.primary, maxWidth: "40%", marginLeft: 16, textAlign: "right" },
    stripe: { height: 3, backgroundColor: c.accent, marginBottom: 18 },
    summary: { flexDirection: "row", backgroundColor: c.panel, borderRadius: 6, paddingVertical: 12, marginBottom: 22 },
    metric: { flex: 1, paddingHorizontal: 14 },
    metricDivider: { borderLeftWidth: 1, borderLeftColor: c.hairline },
    metricLabel: { fontFamily: "Helvetica-Bold", fontSize: 9, marginBottom: 6 },
    metricValue: { fontFamily: "Helvetica-Bold", fontSize: 12, color: c.primary },
    unit: { fontFamily: "Helvetica", color: c.muted },
    section: { fontFamily: "Helvetica-Bold", fontSize: 11.5, marginBottom: 8 },
    th: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: c.hairline, paddingVertical: 7 },
    thText: { fontSize: 7.5, letterSpacing: 1, color: c.accentInk, fontFamily: "Helvetica-Bold" },
    row: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: c.hairline, paddingVertical: 9 },
    cell: { fontSize: 9.5 },
    colDesc: { flex: 1, paddingRight: 10 },
    colDur: { width: 62 },
    colProject: { width: 120 },
    colDate: { width: 66, textAlign: "right" },
    project: { flexDirection: "row", alignItems: "center" },
    dot: { width: 5, height: 5, borderRadius: 3, marginRight: 6 },
    footer: {
      position: "absolute",
      bottom: 24,
      left: GUTTER,
      right: GUTTER,
      flexDirection: "row",
      justifyContent: "space-between",
      fontSize: 8,
      color: c.muted,
    },
  });
}
