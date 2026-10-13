import { pdf } from "@react-pdf/renderer";
import { InvoiceDocument, type InvoiceProps } from "./InvoiceDocument";
import { HoursReportDocument, type HoursReportProps } from "./HoursReportDocument";

export type { InvoiceProps, HoursReportProps };

// Its own module so the PDF renderer (~500 KB) loads only when someone generates a document.
export function renderInvoice(props: InvoiceProps): Promise<Blob> {
  return pdf(<InvoiceDocument {...props} />).toBlob();
}

export function renderHoursReport(props: HoursReportProps): Promise<Blob> {
  return pdf(<HoursReportDocument {...props} />).toBlob();
}
