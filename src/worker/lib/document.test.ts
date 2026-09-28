import { describe, expect, it } from "vitest";
import { DOCX, makeZip } from "../../test/zip";
import { classifyDocument, safeFilename } from "./document";
import { formatForKind } from "@shared/attachments";

const text = (s: string) => new TextEncoder().encode(s);
const kind = (bytes: Uint8Array, name: string) => classifyDocument(bytes, name).kind;

describe("classifyDocument — any file is accepted, typed from its bytes", () => {
  it("recognises a PDF whatever it was named", () => {
    expect(kind(text("%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF"), "brief.pdf")).toBe("pdf");
    expect(kind(text("%PDF-1.7\n%%EOF"), "brief.bin")).toBe("pdf");
  });

  it("keeps a PDF with scripts too — the app's viewer (pdf.js) never runs them", () => {
    expect(kind(text("%PDF-1.7\n<< /S /JavaScript /JS (app.alert(1)) >>"), "x.pdf")).toBe("pdf");
  });

  it("recognises a real Office file, and treats a ZIP that only claims to be one as an opaque file", () => {
    expect(kind(makeZip(DOCX), "notes.docx")).toBe("docx");
    expect(kind(makeZip({ ...DOCX, "word/vbaProject.bin": "x" }), "notes.docx")).toBe("docx");
    expect(kind(makeZip(DOCX), "notes.xlsx")).toBe("file");
    expect(kind(makeZip(DOCX), "archive.zip")).toBe("file");
  });

  it("types TXT and CSV by name, and any other readable text as plain text", () => {
    expect(kind(text("hours,project\n2,Acme — café\n"), "report.csv")).toBe("csv");
    expect(kind(text("plain notes"), "notes.txt")).toBe("txt");
    expect(kind(text("# Plan\n\n- step"), "planejamento.md")).toBe("text");
    expect(kind(text("mindmap\n  root((Plan))"), "exemplo-mapa-mental.mmd")).toBe("text");
  });

  it("stores HTML and SVG as plain text, so they can never render or run script", () => {
    const html = classifyDocument(text("<html><script>alert(1)</script></html>"), "page.html");
    const svg = classifyDocument(text("<svg onload=alert(1)/>"), "logo.svg");
    expect([html.contentType, svg.contentType]).toEqual(["text/plain; charset=utf-8", "text/plain; charset=utf-8"]);
  });

  it("stores programs and other binaries as opaque downloads", () => {
    const exe = classifyDocument(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]), "setup.exe");
    expect(exe).toMatchObject({ kind: "file", contentType: "application/octet-stream" });
    expect(kind(new Uint8Array([0xc3, 0x28, 0x00]), "blob.bin")).toBe("file");
  });
});

describe("safeFilename", () => {
  it("gives a typed file its real extension and leaves any other file's name alone", () => {
    expect(safeFilename("Brief.PDF", formatForKind("pdf"))).toBe("Brief.PDF");
    expect(safeFilename("invoice.exe", formatForKind("pdf"))).toBe("invoice.pdf");
    expect(safeFilename("exemplo-mapa-mental.mmd", formatForKind("text"))).toBe("exemplo-mapa-mental.mmd");
    expect(safeFilename("setup.exe", formatForKind("file"))).toBe("setup.exe");
    expect(safeFilename("", formatForKind("txt"))).toBe("attachment.txt");
  });
});
