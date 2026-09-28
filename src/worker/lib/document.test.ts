import { describe, expect, it } from "vitest";
import { DOCX, makeZip } from "../../test/zip";
import { DocumentRejectedError, inspectDocument, safeFilename } from "./document";
import { formatForKind } from "@shared/attachments";

const text = (s: string) => new TextEncoder().encode(s);
const pdf = (body: string) => text(`%PDF-1.7\n${body}\n%%EOF`);
const kind = (bytes: Uint8Array, name: string) => inspectDocument(bytes, name)?.kind ?? null;
const rejects = (bytes: Uint8Array, name: string, message: RegExp) =>
  expect(() => inspectDocument(bytes, name)).toThrow(message);

describe("inspectDocument — PDF", () => {
  it("accepts a plain PDF, whatever it was named", () => {
    expect(kind(pdf("1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj"), "brief.pdf")).toBe("pdf");
    expect(kind(pdf("1 0 obj << /Type /Catalog >> endobj"), "brief.bin")).toBe("pdf");
  });

  it.each([
    ["a script", "<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>"],
    ["a script under an escaped name", "<< /S /J#61vaScript >>"],
    ["a launch action", "<< /S /Launch /F (cmd.exe) >>"],
    ["an embedded file", "<< /Type /EmbeddedFile /Length 10 >>"],
    ["a form that submits somewhere", "<< /S /SubmitForm /F (https://x.test) >>"],
  ])("refuses a PDF carrying %s", (_label, body) => {
    rejects(pdf(body), "x.pdf", /scripts, actions or embedded files/);
  });

  it("doesn't mistake a longer name for an active one", () => {
    expect(kind(pdf("<< /JSONData 1 /Launcher 2 >>"), "x.pdf")).toBe("pdf");
  });
});

describe("inspectDocument — Office", () => {
  it("accepts a real .docx", () => {
    expect(kind(makeZip(DOCX), "notes.docx")).toBe("docx");
  });

  it("refuses a Word file renamed to .xlsx", () => {
    rejects(makeZip(DOCX), "notes.xlsx", /isn't a real Excel document/);
  });

  it.each([
    ["macros", { "word/vbaProject.bin": "x" }, /macros/],
    ["an embedded OLE object", { "word/embeddings/oleObject1.bin": "x" }, /embedded objects/],
    ["an ActiveX control", { "word/activeX/activeX1.xml": "x" }, /embedded objects|ActiveX/],
    ["a program", { "word/media/setup.exe": "MZ" }, /contains a program/],
  ])("refuses a .docx with %s", (_label, extra, message) => {
    rejects(makeZip({ ...DOCX, ...extra }), "notes.docx", message);
  });

  it("refuses a ZIP that claims to unpack to more than 500 MB (a zip bomb)", () => {
    const zip = makeZip(DOCX);
    const view = new DataView(zip.buffer);
    // Patch the first central-directory entry's uncompressed size.
    const central = zip.findIndex((_, i) => i + 4 <= zip.length && view.getUint32(i, true) === 0x02014b50);
    view.setUint32(central + 24, 600 * 1024 * 1024, true);
    rejects(zip, "notes.docx", /500 MB/);
  });

  it("refuses a plain .zip and a damaged file", () => {
    expect(kind(makeZip(DOCX), "archive.zip")).toBeNull();
    rejects(text("PK\u0003\u0004 not really a zip"), "notes.docx", /damaged/);
  });
});

describe("inspectDocument — text and everything else", () => {
  it("accepts UTF-8 text and CSV", () => {
    expect(kind(text("hours,project\n2,Acme — café\n"), "report.csv")).toBe("csv");
    expect(kind(text("plain notes"), "notes.txt")).toBe("txt");
  });

  it("refuses binary data or a non-UTF-8 file passed off as text", () => {
    rejects(new Uint8Array([0x68, 0x00, 0x69]), "a.txt", /plain text/);
    rejects(new Uint8Array([0xc3, 0x28]), "a.csv", /UTF-8/);
  });

  it("recognises nothing else: executables, HTML, SVG", () => {
    expect(kind(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]), "setup.exe")).toBeNull();
    expect(kind(text("<html><script>alert(1)</script></html>"), "page.html")).toBeNull();
    expect(kind(text("<svg onload=alert(1)/>"), "logo.svg")).toBeNull();
  });

  it("is a DocumentRejectedError, which the route turns into a 400", () => {
    expect(() => inspectDocument(pdf("/JS (x)"), "x.pdf")).toThrow(DocumentRejectedError);
  });
});

describe("safeFilename", () => {
  it("keeps a name whose extension matches, and gives the right one to a name that lies", () => {
    expect(safeFilename("Brief.PDF", formatForKind("pdf"))).toBe("Brief.PDF");
    expect(safeFilename("invoice.exe", formatForKind("pdf"))).toBe("invoice.pdf");
    expect(safeFilename("", formatForKind("txt"))).toBe("attachment.txt");
  });
});
