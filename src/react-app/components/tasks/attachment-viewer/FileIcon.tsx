import { FileSpreadsheet, FileText, Presentation } from "lucide-react";
import { fileExtension } from "@shared/attachments";

/** One icon per file kind, shared by the Attachments grid and the file card in rich text. */
export function FileIcon({ filename, className }: { filename: string; className?: string }) {
  const ext = fileExtension(filename);
  if (ext === "xlsx" || ext === "csv") return <FileSpreadsheet className={className} />;
  if (ext === "pptx") return <Presentation className={className} />;
  return <FileText className={className} />;
}
