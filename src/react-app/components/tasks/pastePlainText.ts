import { Fragment, Slice, type Mark, type Schema } from "@tiptap/pm/model";

/**
 * Plain text pasted one paragraph per line, a blank line kept as an empty paragraph.
 * ProseMirror's default splits on runs of newlines, so every blank line in pasted text vanished.
 */
export function plainTextToSlice(text: string, schema: Schema, marks: readonly Mark[] = []): Slice {
  const lines = text.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
  const paragraphs = lines.map((line) => schema.nodes.paragraph.create(null, line ? schema.text(line, marks) : null));
  return Slice.maxOpen(Fragment.fromArray(paragraphs));
}
