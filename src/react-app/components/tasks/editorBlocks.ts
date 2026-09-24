import { Heading1, Heading2, Heading3, List, ListChecks, ListOrdered, Pilcrow, TextQuote, type LucideIcon } from "lucide-react";
import type { ChainedCommands, Editor } from "@tiptap/react";

/** A block type the description can turn a line into — one catalogue for the selection bar and the "/" menu. */
export interface EditorBlock {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Where it sits in the selection bar: the line's type, or a list. */
  group: "type" | "list";
  /** Extra words "/" matches besides the label, pt-BR included, since that's how the team types. */
  keywords: string[];
  apply: (chain: ChainedCommands) => ChainedCommands;
  isActive: (editor: Editor) => boolean;
}

export const EDITOR_BLOCKS: readonly EditorBlock[] = [
  {
    id: "text",
    label: "Text",
    icon: Pilcrow,
    group: "type",
    keywords: ["paragraph", "texto", "normal"],
    apply: (c) => c.setParagraph(),
    isActive: (e) => e.isActive("paragraph"),
  },
  ...([1, 2, 3] as const).map(
    (level): EditorBlock => ({
      id: `h${level}`,
      label: `Heading ${level}`,
      icon: [Heading1, Heading2, Heading3][level - 1],
      group: "type",
      keywords: [`h${level}`, "heading", "titulo", "título"],
      apply: (c) => c.toggleHeading({ level }),
      isActive: (e) => e.isActive("heading", { level }),
    })
  ),
  {
    id: "quote",
    label: "Quote",
    icon: TextQuote,
    group: "type",
    keywords: ["blockquote", "citacao", "citação"],
    apply: (c) => c.toggleBlockquote(),
    isActive: (e) => e.isActive("blockquote"),
  },
  {
    id: "bulleted",
    label: "Bulleted list",
    icon: List,
    group: "list",
    keywords: ["bullet", "ul", "lista", "marcadores"],
    apply: (c) => c.toggleBulletList(),
    isActive: (e) => e.isActive("bulletList"),
  },
  {
    id: "numbered",
    label: "Numbered list",
    icon: ListOrdered,
    group: "list",
    keywords: ["ordered", "ol", "lista", "numerada"],
    apply: (c) => c.toggleOrderedList(),
    isActive: (e) => e.isActive("orderedList"),
  },
  {
    id: "checklist",
    label: "Checklist",
    icon: ListChecks,
    group: "list",
    keywords: ["todo", "task", "checkbox", "tarefa", "check"],
    apply: (c) => c.toggleTaskList(),
    isActive: (e) => e.isActive("taskList"),
  },
];

const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** What "/query" offers: every block whose label or keywords contain the query, accents ignored. */
export function filterBlocks(query: string): EditorBlock[] {
  const q = fold(query.trim());
  if (!q) return [...EDITOR_BLOCKS];
  return EDITOR_BLOCKS.filter((b) => [b.label, ...b.keywords].some((w) => fold(w).includes(q)));
}
