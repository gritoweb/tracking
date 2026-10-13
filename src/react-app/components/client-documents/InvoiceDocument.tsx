import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import {
  DOCUMENT_TEXT,
  invoiceTotal,
  type DocumentLocale,
  type InvoiceLine,
} from "@shared/client-documents";
import {
  formatMoney,
} from "@/lib/clientDocuments";
import type { BrandPalette } from "./brand";

export interface InvoiceProps {
  locale: DocumentLocale;
  palette: BrandPalette;
  logo: string | null;
  companyName: string;
  companyEmail: string | null;
  clientName: string;
  number: string;
  issueDate: string;
  lines: InvoiceLine[];
  currency: string;
}

const GUTTER = 34;

export function InvoiceDocument(p: InvoiceProps) {
  const t = DOCUMENT_TEXT[p.locale];
  const s = styles(p.palette);
  const money = (n: number) => formatMoney(n, p.currency, p.locale);

  return (
    <Document title={`${t.invoice} ${p.clientName} ${p.number}`} author={p.companyName}>
      <Page size="A4" style={s.page}>
        <View style={s.header}>
          <View style={s.headerLeft}>
            {p.logo ? <Image src={p.logo} style={s.logo} /> : <Text style={s.companyName}>{p.companyName}</Text>}
            {p.companyEmail && <Text style={s.email}>{p.companyEmail}</Text>}
          </View>
          <View style={[s.right, s.headerRight]}>
            <Text style={s.kicker}>{t.invoice.toUpperCase()}</Text>
            <Text style={s.number}>#{p.number}</Text>
          </View>
        </View>
        <View style={s.stripe} />

        <View style={s.parties}>
          <View style={s.billedTo}>
            <Text style={s.label}>{t.billedTo.toUpperCase()}</Text>
            <Text style={s.strong}>{p.clientName}</Text>
          </View>
          <View style={s.right}>
            <Text style={s.label}>{t.issueDate.toUpperCase()}</Text>
            <Text style={s.strong}>{p.issueDate}</Text>
          </View>
        </View>

        <View style={s.body}>
          <View style={s.row}>
            <Text style={[s.th, s.colDesc]}>{t.description.toUpperCase()}</Text>
            <Text style={[s.th, s.colQty]}>{t.qtyHours.toUpperCase()}</Text>
            <Text style={[s.th, s.colAmount]}>{t.amount.toUpperCase()}</Text>
          </View>
          {p.lines.map((l, i) => (
            <View key={i} style={[s.row, s.line]} wrap={false}>
              <Text style={[s.strong, s.colDesc]}>{l.description}</Text>
              <Text style={[s.cell, s.colQty]}>{l.hours ?? "—"}</Text>
              <Text style={[s.cell, s.colAmount]}>{money(l.amount)}</Text>
            </View>
          ))}

          <View style={s.totalBox} wrap={false}>
            <Text style={s.totalLabel}>{t.total.toUpperCase()}</Text>
            <Text style={s.totalValue}>{money(invoiceTotal(p.lines))}</Text>
          </View>

          <Text style={s.thanks}>{t.thanks(p.companyName)}</Text>
        </View>
      </Page>
    </Document>
  );
}

function styles(c: BrandPalette) {
  return StyleSheet.create({
    page: { fontFamily: "Helvetica", fontSize: 11, color: c.text, paddingBottom: 40 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", padding: GUTTER, paddingBottom: 18 },
    // Any logo, number or name length has to stay on the page: each side gets a share and wraps inside it.
    headerLeft: { flexShrink: 1, maxWidth: "45%", paddingRight: 16 },
    headerRight: { flexShrink: 1, maxWidth: "55%" },
    logo: { height: 40, maxWidth: 220, objectFit: "contain", objectPositionX: 0, marginBottom: 4 },
    companyName: { fontFamily: "Helvetica-Bold", fontSize: 16, color: c.primary, marginBottom: 4 },
    email: { fontSize: 9.5, color: c.muted },
    right: { alignItems: "flex-end" },
    kicker: { fontFamily: "Helvetica-Bold", fontSize: 8, letterSpacing: 2.5, color: c.primary, marginBottom: 6 },
    number: { fontFamily: "Helvetica-Bold", fontSize: 26, color: c.primary, textAlign: "right" },
    stripe: { height: 3, backgroundColor: c.accent },
    parties: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingHorizontal: GUTTER,
      paddingVertical: 22,
      borderBottomWidth: 1,
      borderBottomColor: c.hairline,
    },
    billedTo: { flex: 1, paddingRight: 24 },
    label: { fontSize: 7.5, letterSpacing: 1.5, color: c.muted, marginBottom: 8 },
    strong: { fontFamily: "Helvetica-Bold", fontSize: 12 },
    body: { paddingHorizontal: GUTTER, paddingTop: 18 },
    row: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
    line: { borderBottomWidth: 1, borderBottomColor: c.hairline, paddingVertical: 11 },
    th: { fontFamily: "Helvetica-Bold", fontSize: 7.5, letterSpacing: 1.5, color: c.accentInk },
    cell: { fontSize: 11 },
    colDesc: { flex: 1 },
    colQty: { width: 90, textAlign: "center" },
    colAmount: { width: 130, textAlign: "right" },
    totalBox: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      alignSelf: "flex-end",
      // Grows with the amount instead of a fixed width, so a large total never spills out of the box.
      minWidth: 240,
      marginTop: 28,
      paddingVertical: 16,
      paddingHorizontal: 20,
      borderWidth: 1,
      borderColor: c.primary,
      borderRadius: 6,
    },
    totalLabel: { fontFamily: "Helvetica-Bold", fontSize: 11, letterSpacing: 3, color: c.primary, marginRight: 28 },
    totalValue: { fontFamily: "Helvetica-Bold", fontSize: 24, color: c.primary },
    thanks: { fontFamily: "Helvetica-Oblique", fontSize: 9.5, color: c.muted, marginTop: 40 },
  });
}
