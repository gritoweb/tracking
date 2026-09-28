import { Lexer, type Token, type Tokens } from "marked";
import { FILE_ATTACHMENT_NODE, parseDoc, type RichNode } from "./rich-doc";
import { SWATCH_COLORS, SWATCH_COLOR_NAMES } from "./colors";

// Markdown is how a model writes and reads rich text (MCP, the Assistant); the app stores the editor's JSON doc.

type Mark = { type: string; attrs?: Record<string, unknown> };

// Only these reach a link; anything else (javascript:, data:) is kept as plain text.
const SAFE_HREF = /^(https?:\/\/|mailto:|\/(?!\/))/i;
const MENTION_HREF = /^user:([\w-]+)$/;
// An image in the text can only be one of the task's own uploads.
const ATTACHMENT_SRC = /^\/api\/attachments\/[\w-]+$/;
const MAX_HEADING = 3;
// The editor's only HTML-looking syntax: underline, and a text colour from its own palette. Anything else stays text.
const UNDERLINE_OPEN = /^<u>$/i;
const UNDERLINE_CLOSE = /^<\/u>$/i;
const COLOR_OPEN = /^<span style="color:\s*(#[0-9a-f]{6})\s*;?">$/i;
const COLOR_CLOSE = /^<\/span>$/i;

const ENTITIES: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
const decode = (text: string) => text.replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e]);

function inline(tokens: Token[] | undefined, outer: Mark[] = []): RichNode[] {
  const out: RichNode[] = [];
  // <u>…</u> and <span style="color:…">…</span> arrive as separate open/close tokens around the text they mark.
  let marks = outer;
  const text = (value: string, extra: Mark[] = marks) => {
    if (value) out.push(extra.length ? { type: "text", text: value, marks: extra } as RichNode : { type: "text", text: value });
  };

  for (const token of tokens ?? []) {
    switch (token.type) {
      case "text":
        if ("tokens" in token && token.tokens?.length) out.push(...inline(token.tokens, marks));
        else text(decode(token.text));
        break;
      case "escape":
        text(decode(token.text));
        break;
      case "strong":
        out.push(...inline(token.tokens, [...marks, { type: "bold" }]));
        break;
      case "em":
        out.push(...inline(token.tokens, [...marks, { type: "italic" }]));
        break;
      case "del":
        out.push(...inline(token.tokens, [...marks, { type: "strike" }]));
        break;
      case "codespan":
        // The editor's code mark excludes every other mark.
        text(decode(token.text), [{ type: "code" }]);
        break;
      case "br":
        out.push({ type: "hardBreak" });
        break;
      case "link": {
        const link = token as Tokens.Link;
        const mention = link.href.match(MENTION_HREF);
        const before = out[out.length - 1];
        // @[Name](user:ID) — the lexer sees "@" then a link; together they are a mention.
        if (mention && before?.type === "text" && before.text?.endsWith("@")) {
          before.text = before.text.slice(0, -1);
          if (!before.text) out.pop();
          out.push({ type: "mention", attrs: { id: mention[1], label: decode(link.text) } });
        } else if (SAFE_HREF.test(link.href)) {
          out.push(...inline(link.tokens, [...marks, { type: "link", attrs: { href: link.href } }]));
        } else {
          out.push(...inline(link.tokens, marks));
        }
        break;
      }
      case "image": {
        const image = token as Tokens.Image;
        if (ATTACHMENT_SRC.test(image.href)) out.push({ type: "image", attrs: { src: image.href, alt: image.text || null } });
        else text(image.text);
        break;
      }
      case "html": {
        const raw = String(token.raw).trim();
        const color = raw.match(COLOR_OPEN)?.[1]?.toLowerCase();
        if (UNDERLINE_OPEN.test(raw)) marks = [...marks, { type: "underline" }];
        else if (UNDERLINE_CLOSE.test(raw) && marks.some((m) => m.type === "underline")) marks = marks.filter((m) => m.type !== "underline");
        else if (color && (SWATCH_COLORS as readonly string[]).includes(color)) marks = [...marks, { type: "textStyle", attrs: { color } }];
        else if (COLOR_CLOSE.test(raw) && marks.some((m) => m.type === "textStyle")) marks = marks.filter((m) => m.type !== "textStyle");
        // Any other HTML stays visible as the text that was written, never as markup.
        else text(String(token.raw));
        break;
      }
      default:
        // Anything unknown stays visible as the text that was written, never as markup.
        text("raw" in token ? String(token.raw) : "");
    }
  }
  return out;
}

/** Adjacent text with the same marks as one node, the way the editor itself stores it. */
function mergeText(nodes: RichNode[]): RichNode[] {
  const out: RichNode[] = [];
  for (const node of nodes) {
    const last = out[out.length - 1];
    const sameMarks = (a: RichNode, b: RichNode) =>
      JSON.stringify((a as { marks?: unknown }).marks ?? []) === JSON.stringify((b as { marks?: unknown }).marks ?? []);
    if (node.type === "text" && last?.type === "text" && sameMarks(last, node)) out[out.length - 1] = { ...last, text: `${last.text}${node.text}` };
    else out.push(node);
  }
  return out;
}

/** A paragraph's inline content, with any image split out as its own block (the editor's image is a block node). */
function paragraphs(content: RichNode[]): RichNode[] {
  const out: RichNode[] = [];
  let run: RichNode[] = [];
  const flush = () => {
    if (run.length) out.push({ type: "paragraph", content: run });
    run = [];
  };
  for (const node of content) {
    if (node.type === "image") {
      flush();
      out.push(node);
    } else run.push(node);
  }
  flush();
  for (const block of out) if (block.content) block.content = mergeText(block.content);
  // A line that is only a link to one of the task's files is that file's card, as the editor shows it.
  const blocks = out.map((block) => {
    const only = block.content?.length === 1 ? (block.content[0] as RichNode & { marks?: Mark[] }) : null;
    const href = only?.type === "text" && only.marks?.length === 1 && only.marks[0].type === "link" ? String(only.marks[0].attrs?.href) : "";
    return ATTACHMENT_SRC.test(href) ? { type: FILE_ATTACHMENT_NODE, attrs: { href, filename: only!.text } } : block;
  });
  return blocks.length ? blocks : [{ type: "paragraph" }];
}

function blocks(tokens: Token[]): RichNode[] {
  const out: RichNode[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case "space":
        break;
      case "heading":
        out.push({ type: "heading", attrs: { level: Math.min(token.depth, MAX_HEADING) }, content: mergeText(inline(token.tokens)) });
        break;
      case "paragraph":
      case "text":
        out.push(...paragraphs(inline("tokens" in token && token.tokens ? token.tokens : [{ type: "text", raw: token.raw, text: token.text } as Token])));
        break;
      case "list": {
        const list = token as Tokens.List;
        const checklist = list.items.every((item) => item.task);
        const items = list.items.map((item) => {
          const content = blocks(item.tokens.filter((t) => t.type !== "checkbox"));
          // A list item must open with a paragraph.
          if (content[0]?.type !== "paragraph") content.unshift({ type: "paragraph" });
          return checklist
            ? { type: "taskItem", attrs: { checked: Boolean(item.checked) }, content }
            : { type: "listItem", content };
        });
        if (checklist) out.push({ type: "taskList", content: items });
        else if (list.ordered) out.push({ type: "orderedList", attrs: { start: Number(list.start) || 1 }, content: items });
        else out.push({ type: "bulletList", content: items });
        break;
      }
      case "code":
        out.push({
          type: "codeBlock",
          attrs: { language: token.lang || null },
          ...(token.text ? { content: [{ type: "text", text: token.text }] } : {}),
        });
        break;
      case "blockquote":
        out.push({ type: "blockquote", content: blocks(token.tokens ?? []) });
        break;
      case "hr":
        out.push({ type: "horizontalRule" });
        break;
      case "table": {
        // The editor has no tables: one line per row, cells split by " | ".
        const table = token as Tokens.Table;
        for (const row of [table.header, ...table.rows]) {
          out.push({ type: "paragraph", content: [{ type: "text", text: row.map((cell) => decode(cell.text)).join(" | ") }] });
        }
        break;
      }
      default:
        if (token.raw?.trim()) out.push({ type: "paragraph", content: [{ type: "text", text: token.raw.trim() }] });
    }
  }
  return out;
}

/** Everything the task editor can show, as the Markdown this converter reads — one list for the guide and the tool docs. */
export const RICH_TEXT_SYNTAX: readonly (readonly [what: string, how: string])[] = [
  ["Headings, up to 3 levels", "`# `, `## `, `### `"],
  ["Bold, italic, strike, underline", "`**bold**`, `*italic*`, `~~strike~~`, `<u>underline</u>`"],
  [
    "Text colour, from the editor's palette only",
    `\`<span style="color:${SWATCH_COLORS[0]}">${SWATCH_COLOR_NAMES[SWATCH_COLORS[0]].toLowerCase()} text</span>\` — ${SWATCH_COLORS.map((c) => `${SWATCH_COLOR_NAMES[c]} ${c}`).join(", ")}`,
  ],
  ["Inline code and code blocks", "`` `code` ``, and a block between two ```` ``` ```` lines (a language after the first is kept)"],
  ["Lists, nested by indenting two spaces", "`- item`, `1. item`"],
  ["Checklist", "`- [ ] to do`, `- [x] done`"],
  ["Quote", "`> text`"],
  ["Divider", "`---` on a line of its own"],
  ["Line break inside a paragraph", "a single newline (a blank line starts a new paragraph)"],
  ["Link", "`[text](https://…)` — http, https, mailto or an app path; anything else stays plain text"],
  ["Mention (the person is notified)", "`@[Name](user:ID)`, the id from list_members"],
  ["Image", "`![alt](/api/attachments/ID)`, for an image uploaded to the task (upload_task_attachment)"],
  ["File card", "`[file name](/api/attachments/ID)` alone on a line, for any other file uploaded to the task"],
];

/** What the editor can't show, so a model doesn't try. */
export const RICH_TEXT_UNSUPPORTED =
  "No tables (each row becomes a line of text), no headings below `###`, no colours outside the palette, and no other HTML (it is shown as typed).";

/** Markdown (what a model writes) → the editor's doc, as the JSON string the app stores; null for empty. */
export function markdownToDocJson(markdown: string | null | undefined): string | null {
  if (!markdown?.trim()) return null;
  const content = blocks(new Lexer({ gfm: true, breaks: true }).lex(markdown.replace(/\r\n?/g, "\n")));
  return JSON.stringify({ type: "doc", content: content.length ? content : [{ type: "paragraph" }] });
}

// ─── doc → Markdown ──────────────────────────────────────────────────────────

const escapeText = (text: string) => text.replace(/([\\`*[\]~])/g, "\\$1");

function inlineMarkdown(nodes: RichNode[] | undefined): string {
  return (nodes ?? [])
    .map((node) => {
      if (node.type === "hardBreak") return "\n";
      if (node.type === "mention") return `@[${String(node.attrs?.label ?? node.attrs?.id)}](user:${String(node.attrs?.id)})`;
      if (node.type !== "text") return "";
      const marks = ((node as RichNode & { marks?: Mark[] }).marks ?? []).map((m) => m.type);
      const link = (node as RichNode & { marks?: Mark[] }).marks?.find((m) => m.type === "link");
      if (marks.includes("code")) return `\`${node.text ?? ""}\``;
      let text = escapeText(node.text ?? "");
      if (marks.includes("bold")) text = `**${text}**`;
      if (marks.includes("italic")) text = `*${text}*`;
      if (marks.includes("strike")) text = `~~${text}~~`;
      if (marks.includes("underline")) text = `<u>${text}</u>`;
      const color = (node as RichNode & { marks?: Mark[] }).marks?.find((m) => m.type === "textStyle")?.attrs?.color;
      if (typeof color === "string" && color) text = `<span style="color:${color}">${text}</span>`;
      if (link) text = `[${text}](${String(link.attrs?.href ?? "")})`;
      return text;
    })
    .join("");
}

const indent = (text: string, by: string) => text.split("\n").map((line, i) => (i === 0 || !line ? line : by + line)).join("\n");

function blockMarkdown(node: RichNode): string {
  switch (node.type) {
    case "paragraph":
      return inlineMarkdown(node.content);
    case "heading":
      return `${"#".repeat(Number(node.attrs?.level ?? 1))} ${inlineMarkdown(node.content)}`;
    case "bulletList":
    case "orderedList":
    case "taskList": {
      const start = Number(node.attrs?.start ?? 1);
      return (node.content ?? [])
        .map((item, i) => {
          const marker =
            node.type === "orderedList" ? `${start + i}. ` : node.type === "taskList" ? `- [${item.attrs?.checked ? "x" : " "}] ` : "- ";
          return marker + indent((item.content ?? []).map(blockMarkdown).join("\n"), " ".repeat(marker.length));
        })
        .join("\n");
    }
    case "codeBlock":
      return `\`\`\`${String(node.attrs?.language ?? "")}\n${(node.content ?? []).map((t) => t.text ?? "").join("")}\n\`\`\``;
    case "blockquote":
      return (node.content ?? []).map(blockMarkdown).join("\n\n").split("\n").map((line) => `> ${line}`).join("\n");
    case "horizontalRule":
      return "---";
    case "image":
      return `![${String(node.attrs?.alt ?? "")}](${String(node.attrs?.src ?? "")})`;
    case FILE_ATTACHMENT_NODE:
      return `[${escapeText(String(node.attrs?.filename ?? "file"))}](${String(node.attrs?.href ?? "")})`;
    default:
      return (node.content ?? []).map(blockMarkdown).join("\n\n");
  }
}

/** A stored description or comment as Markdown for a model; legacy plain text passes through unchanged. */
export function docJsonToMarkdown(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const doc = parseDoc(raw);
  if (!doc) return raw;
  return (doc.content ?? []).map(blockMarkdown).join("\n\n").trim() || null;
}
