import { fileExtension, formatForKind, type AttachmentFormat } from "@shared/attachments";

// Any file is accepted; this only decides how it is typed. Nothing uploaded is ever run or rendered as a page:
// non-images are served as downloads with nosniff and a sandbox CSP (routes/attachments.ts).

const OFFICE_ROOT: Record<"docx" | "xlsx" | "pptx", string> = {
  docx: "word/document.xml",
  xlsx: "xl/workbook.xml",
  pptx: "ppt/presentation.xml",
};

/** Entry names from the ZIP central directory — read from headers, nothing is inflated; null when it isn't a readable ZIP. */
function zipEntryNames(bytes: Uint8Array): string[] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // End-of-central-directory record: signature 0x06054b50, within the last 64 KB + 22 bytes.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) return null;
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const names: string[] = [];
  const utf8 = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) return null;
    const nameLength = view.getUint16(offset + 28, true);
    if (offset + 46 + nameLength > bytes.length) return null;
    names.push(utf8.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)).toLowerCase());
    offset += 46 + nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
  }
  return names;
}

/** Readable text: valid UTF-8 with no NUL byte. */
function isText(bytes: Uint8Array): boolean {
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((b, i) => bytes[i] === b);
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04

/**
 * How a non-image upload is stored, decided from its bytes: PDF, a real docx/xlsx/pptx, TXT/CSV, any other
 * text, or an opaque file. The filename only picks between formats the bytes can't tell apart.
 */
export function classifyDocument(bytes: Uint8Array, filename: string): AttachmentFormat {
  const ext = fileExtension(filename);
  if (startsWith(bytes, PDF_SIGNATURE)) return formatForKind("pdf");
  if (startsWith(bytes, ZIP_SIGNATURE) && (ext === "docx" || ext === "xlsx" || ext === "pptx")) {
    const names = zipEntryNames(bytes);
    if (names?.includes("[content_types].xml") && names.includes(OFFICE_ROOT[ext])) return formatForKind(ext);
    return formatForKind("file");
  }
  if (isText(bytes)) return formatForKind(ext === "txt" || ext === "csv" ? ext : "text");
  return formatForKind("file");
}

/** A typed file's name ends in its real extension (`invoice.exe` holding a PDF is `invoice.pdf`); other files keep theirs. */
export function safeFilename(filename: string, format: AttachmentFormat): string {
  const name = (filename || "attachment").trim() || "attachment";
  if (!format.extensions.length) return name;
  const ext = fileExtension(name);
  if (format.extensions.includes(ext)) return name;
  const stem = name.lastIndexOf(".") > 0 ? name.slice(0, name.lastIndexOf(".")) : name;
  return `${stem}.${format.extensions[0]}`;
}
