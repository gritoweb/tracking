import { describe, expect, it } from "vitest";
import { docJsonToMarkdown, markdownToDocJson } from "./markdown-doc";
import { docMentions } from "./mentions";

const doc = (markdown: string) => JSON.parse(markdownToDocJson(markdown)!) as { content: Array<Record<string, unknown>> };

describe("markdownToDocJson — what a model writes becomes the editor's blocks", () => {
  it("turns headings, checklists, lists and paragraphs into the editor's nodes", () => {
    const { content } = doc("## Acceptance criteria\n\n- [ ] Copy approved\n- [x] Logo in place\n\n1. First\n2. Second\n\n- one\n- two\n\nPlain note.");
    expect(content.map((n) => n.type)).toEqual(["heading", "taskList", "orderedList", "bulletList", "paragraph"]);
    expect(content[0]).toMatchObject({ attrs: { level: 2 }, content: [{ type: "text", text: "Acceptance criteria" }] });
    expect(content[1]).toMatchObject({
      content: [
        { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [{ text: "Copy approved" }] }] },
        { type: "taskItem", attrs: { checked: true } },
      ],
    });
  });

  it("keeps bold, italic, strike, inline code and safe links as marks", () => {
    const [p] = doc("**bold** *it* ~~gone~~ `code` [site](https://example.com)").content as Array<{ content: unknown[] }>;
    expect(p.content).toEqual([
      { type: "text", text: "bold", marks: [{ type: "bold" }] },
      { type: "text", text: " " },
      { type: "text", text: "it", marks: [{ type: "italic" }] },
      { type: "text", text: " " },
      { type: "text", text: "gone", marks: [{ type: "strike" }] },
      { type: "text", text: " " },
      { type: "text", text: "code", marks: [{ type: "code" }] },
      { type: "text", text: " " },
      { type: "text", text: "site", marks: [{ type: "link", attrs: { href: "https://example.com" } }] },
    ]);
  });

  it("turns @[Name](user:ID) into a mention the app notifies", () => {
    const json = markdownToDocJson("Please review, @[Ana Maria](user:u-ana)");
    expect(docMentions(json)).toEqual([{ userId: "u-ana", label: "Ana Maria" }]);
  });

  it("never makes a link out of javascript: or data:, and never renders HTML", () => {
    const json = markdownToDocJson("[click](javascript:alert(1)) [x](data:text/html,hi) <script>alert(1)</script>")!;
    expect(json).not.toContain('"type":"link"');
    // Kept as the visible text it was, inside a text node.
    expect(json).toContain('"text":"click x <script>alert(1)</script>"');
    expect(json).not.toContain('"type":"html"');
  });

  it("keeps an image only when it is one of the task's own uploads", () => {
    expect(doc("![shot](/api/attachments/a1)").content).toEqual([{ type: "image", attrs: { src: "/api/attachments/a1", alt: "shot" } }]);
    expect(JSON.stringify(doc("![x](https://evil.test/p.png)"))).not.toContain('"type":"image"');
  });

  it("clears a description when given nothing", () => {
    expect(markdownToDocJson("")).toBeNull();
    expect(markdownToDocJson("   \n")).toBeNull();
  });
});

describe("docJsonToMarkdown — what a model reads", () => {
  it("round-trips the structure a model writes", () => {
    const markdown = "## Plan\n\n- [ ] Draft\n- [x] Review\n\n1. One\n2. Two\n\n**Bold** and @[Ana](user:u-ana)";
    expect(docJsonToMarkdown(markdownToDocJson(markdown))).toBe(markdown);
  });

  it("passes legacy plain text through untouched", () => {
    expect(docJsonToMarkdown("just text, not JSON")).toBe("just text, not JSON");
  });

  it("names a file card and escapes characters that would change the meaning", () => {
    const json = JSON.stringify({
      type: "doc",
      content: [
        { type: "fileAttachment", attrs: { href: "/api/attachments/f1", filename: "brief.pdf" } },
        { type: "paragraph", content: [{ type: "text", text: "5 * 3 [draft]" }] },
      ],
    });
    expect(docJsonToMarkdown(json)).toBe("[brief.pdf](/api/attachments/f1)\n\n5 \\* 3 \\[draft\\]");
  });
});

describe("every feature of the editor", () => {
  it("reads underline and a palette colour as the editor's marks", () => {
    const [p] = doc('<u>under</u> and <span style="color:#ef4444">red</span>').content as Array<{ content: unknown[] }>;
    expect(p.content).toEqual([
      { type: "text", text: "under", marks: [{ type: "underline" }] },
      { type: "text", text: " and " },
      { type: "text", text: "red", marks: [{ type: "textStyle", attrs: { color: "#ef4444" } }] },
    ]);
  });

  it("keeps a colour outside the palette, and any other HTML, as plain text", () => {
    const json = markdownToDocJson('<span style="color:#123456">x</span> <b>bold?</b>')!;
    expect(json).not.toContain("textStyle");
    expect(json).not.toContain('"bold"');
    expect(json).toContain("<b>");
  });

  it("turns a line that is only a link to a task file into that file's card", () => {
    expect(doc("[brief.pdf](/api/attachments/f1)").content).toEqual([
      { type: "fileAttachment", attrs: { href: "/api/attachments/f1", filename: "brief.pdf" } },
    ]);
    // Inside a sentence it stays a link.
    expect(JSON.stringify(doc("See [brief.pdf](/api/attachments/f1) first").content)).toContain('"type":"link"');
  });

  it("reads strike, dividers, code blocks, nested lists and line breaks", () => {
    const { content } = doc("~~old~~\n\n---\n\n```ts\nconst a = 1;\n```\n\n- parent\n  - child\n\nline one\nline two");
    expect(content.map((n) => n.type)).toEqual(["paragraph", "horizontalRule", "codeBlock", "bulletList", "paragraph"]);
    expect(content[2]).toMatchObject({ attrs: { language: "ts" }, content: [{ text: "const a = 1;" }] });
    expect(JSON.stringify(content[3])).toMatch(/"bulletList".*"bulletList"/);
    expect(JSON.stringify(content[4])).toContain('"hardBreak"');
  });

  it("round-trips underline, colour and a file card, so editing notes through MCP keeps them", () => {
    const markdown = '<u>under</u> <span style="color:#22c55e">green</span>\n\n[brief.pdf](/api/attachments/f1)';
    expect(docJsonToMarkdown(markdownToDocJson(markdown))).toBe(markdown);
  });
});
