import { fileExtension, formatForKind, type AttachmentFormat, type AttachmentKind } from "@shared/attachments";

/** Raised for a document that is not what it claims or carries active content — the route answers 400. */
export class DocumentRejectedError extends Error {}

// ─── PDF ─────────────────────────────────────────────────────────────────────

// Actions a viewer can run or launch on open; a document for a task never needs them.
const PDF_ACTIVE = new Set(["JavaScript", "JS", "Launch", "EmbeddedFile", "EmbeddedFiles", "RichMedia", "SubmitForm", "ImportData"]);
// PDF whitespace and delimiters: where a name ends.
const PDF_NAME_END = new Set([0x00, 0x09, 0x0a, 0x0c, 0x0d, 0x20, 0x28, 0x29, 0x3c, 0x3e, 0x5b, 0x5d, 0x7b, 0x7d, 0x2f, 0x25]);
const MAX_NAME = 64;

const hexValue = (b: number) => (b >= 0x30 && b <= 0x39 ? b - 0x30 : b >= 0x41 && b <= 0x46 ? b - 0x37 : b >= 0x61 && b <= 0x66 ? b - 0x57 : -1);

/** Refuses PDFs with scripts, launch actions or embedded files; scans the bytes in place, undoing `#xx` escapes (`/J#61vaScript`). */
function checkPdf(bytes: Uint8Array): void {
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 0x2f) continue;
    let name = "";
    let j = i + 1;
    while (j < bytes.length && !PDF_NAME_END.has(bytes[j]) && name.length <= MAX_NAME) {
      const hi = j + 2 < bytes.length ? hexValue(bytes[j + 1]) : -1;
      const lo = j + 2 < bytes.length ? hexValue(bytes[j + 2]) : -1;
      if (bytes[j] === 0x23 && hi >= 0 && lo >= 0) {
        name += String.fromCharCode(hi * 16 + lo);
        j += 3;
      } else {
        name += String.fromCharCode(bytes[j]);
        j += 1;
      }
    }
    if (PDF_ACTIVE.has(name)) {
      throw new DocumentRejectedError("This PDF contains scripts, actions or embedded files and can't be attached");
    }
    i = j - 1;
  }
}

// ─── Office (OOXML is a ZIP) ─────────────────────────────────────────────────

const MAX_ZIP_ENTRIES = 5000;
// Unpacked size a 25 MB document may claim; above it, it is a zip bomb, not a document.
const MAX_ZIP_UNPACKED_BYTES = 500 * 1024 * 1024;
const EXECUTABLE_EXTENSIONS = new Set([
  "exe", "dll", "com", "scr", "msi", "bat", "cmd", "ps1", "vbs", "vbe", "js", "jse", "wsf", "hta", "jar", "sh", "lnk", "app",
]);
const OFFICE_ROOT: Record<"docx" | "xlsx" | "pptx", string> = {
  docx: "word/document.xml",
  xlsx: "xl/workbook.xml",
  pptx: "ppt/presentation.xml",
};

/** Entry names and total unpacked size from the ZIP central directory — read from headers, nothing is inflated. */
function zipEntries(bytes: Uint8Array): { names: string[]; unpacked: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const malformed = () => new DocumentRejectedError("This file is damaged or isn't a real Office document");
  // End-of-central-directory record: signature 0x06054b50, within the last 64 KB + 22 bytes.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw malformed();
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (count > MAX_ZIP_ENTRIES) throw new DocumentRejectedError("This document has too many parts to be attached");

  const names: string[] = [];
  let unpacked = 0;
  const utf8 = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) throw malformed();
    unpacked += view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    if (offset + 46 + nameLength > bytes.length) throw malformed();
    names.push(utf8.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)));
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return { names, unpacked };
}

/** A real docx/xlsx/pptx of the claimed kind, with no macros, no embedded OLE objects and no executables inside. */
function checkOffice(bytes: Uint8Array, kind: "docx" | "xlsx" | "pptx"): void {
  const { names, unpacked } = zipEntries(bytes);
  if (unpacked > MAX_ZIP_UNPACKED_BYTES) throw new DocumentRejectedError("This document unpacks to more than 500 MB and can't be attached");
  const lower = names.map((n) => n.toLowerCase());
  if (!lower.includes("[content_types].xml") || !lower.includes(OFFICE_ROOT[kind])) {
    throw new DocumentRejectedError(`This file isn't a real ${formatForKind(kind).label} document`);
  }
  for (const name of lower) {
    const base = name.split("/").pop() ?? "";
    if (base === "vbaproject.bin" || base === "vbadata.xml") {
      throw new DocumentRejectedError("Documents with macros can't be attached");
    }
    if (/\/embeddings\/.*\.bin$/.test(name) || name.includes("activex")) {
      throw new DocumentRejectedError("Documents with embedded objects or ActiveX controls can't be attached");
    }
    if (EXECUTABLE_EXTENSIONS.has(fileExtension(base))) {
      throw new DocumentRejectedError("This document contains a program and can't be attached");
    }
  }
}

// ─── Plain text ──────────────────────────────────────────────────────────────

function checkText(bytes: Uint8Array): void {
  if (bytes.includes(0)) throw new DocumentRejectedError("This isn't a plain text file");
  try {
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    throw new DocumentRejectedError("Text files must be UTF-8");
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((b, i) => bytes[i] === b);
const PDF_SIGNATURE = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // PK\x03\x04

/**
 * Which accepted non-image format these bytes are, checked for active content; null when they match none.
 * The kind comes from the bytes, and the filename only decides between formats the bytes can't tell apart
 * (which Office app a ZIP is for, TXT vs CSV).
 */
export function inspectDocument(bytes: Uint8Array, filename: string): AttachmentFormat | null {
  const ext = fileExtension(filename);
  let kind: AttachmentKind;
  if (startsWith(bytes, PDF_SIGNATURE)) {
    checkPdf(bytes);
    kind = "pdf";
  } else if (startsWith(bytes, ZIP_SIGNATURE)) {
    if (ext !== "docx" && ext !== "xlsx" && ext !== "pptx") return null;
    checkOffice(bytes, ext);
    kind = ext;
  } else if (ext === "txt" || ext === "csv") {
    checkText(bytes);
    kind = ext;
  } else {
    return null;
  }
  return formatForKind(kind);
}

/** The stored name always ends in the detected format's extension, so a download can't be `invoice.pdf.exe`. */
export function safeFilename(filename: string, format: AttachmentFormat): string {
  const name = (filename || "attachment").trim() || "attachment";
  const ext = fileExtension(name);
  if (format.extensions.includes(ext)) return name;
  const stem = name.lastIndexOf(".") > 0 ? name.slice(0, name.lastIndexOf(".")) : name;
  return `${stem}.${format.extensions[0]}`;
}
