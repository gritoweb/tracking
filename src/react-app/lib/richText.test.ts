import { describe, expect, it } from "vitest";
import { descriptionToPlainText, normalizeLinkHref, parseDescription, serializeDescription } from "./richText";

describe("parseDescription", () => {
  it("returns the editor's empty doc for null/empty input", () => {
    expect(parseDescription(null)).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("wraps a legacy plain-text description in a single paragraph", () => {
    expect(parseDescription("Call the client")).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Call the client" }] }],
    });
  });

  it("wraps text that merely looks numeric or boolean, since it isn't a tiptap doc", () => {
    expect(parseDescription("42")).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "42" }] }],
    });
  });

  it("passes an existing tiptap doc through unchanged", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }] };
    expect(parseDescription(JSON.stringify(doc))).toEqual(doc);
  });
});

describe("serializeDescription / parseDescription round-trip", () => {
  it("round-trips a legacy plain-text description through both directions", () => {
    const original = "Fixed the login bug";
    const doc = parseDescription(original);
    const serialized = serializeDescription(doc);
    expect(serialized).not.toBeNull();
    expect(descriptionToPlainText(serialized)).toBe(original);
  });

  it("serializes an empty doc back to null rather than an empty JSON string", () => {
    const empty = { type: "doc", content: [{ type: "paragraph" }] };
    expect(serializeDescription(empty)).toBeNull();
  });

  it("treats a doc with only empty paragraphs as empty too", () => {
    const empty = {
      type: "doc",
      content: [{ type: "paragraph" }, { type: "paragraph", content: [] }],
    };
    expect(serializeDescription(empty)).toBeNull();
  });

  it("serializes a non-empty doc to its JSON form", () => {
    const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }] };
    expect(serializeDescription(doc)).toBe(JSON.stringify(doc));
  });
});

describe("descriptionToPlainText", () => {
  it("is empty for null", () => {
    expect(descriptionToPlainText(null)).toBe("");
  });

  it("returns raw text unchanged when it isn't JSON", () => {
    expect(descriptionToPlainText("Plain text description")).toBe("Plain text description");
  });

  it("returns raw text unchanged when it's JSON but not a tiptap doc", () => {
    expect(descriptionToPlainText('{"foo":"bar"}')).toBe('{"foo":"bar"}');
  });

  it("walks nested content, joining text nodes with a space", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello" },
            { type: "text", text: "world" },
          ],
        },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "text", text: "one" }] }] },
      ],
    };
    expect(descriptionToPlainText(JSON.stringify(doc))).toBe("Hello world one");
  });
});

describe("formatting from the selection bar", () => {
  it("reads headings and colored text as plain text, dropping the marks", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Scope" }] },
        {
          type: "paragraph",
          content: [{ type: "text", text: "urgent", marks: [{ type: "textStyle", attrs: { color: "#ef4444" } }] }],
        },
        { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Notes" }] },
      ],
    };
    expect(descriptionToPlainText(JSON.stringify(doc))).toBe("Scope urgent Notes");
  });
});

describe("normalizeLinkHref", () => {
  it("treats a bare domain as a web address", () => {
    expect(normalizeLinkHref("example.com/page")).toBe("https://example.com/page");
  });

  it("keeps an explicit scheme and trims whitespace", () => {
    expect(normalizeLinkHref("  mailto:team@example.com ")).toBe("mailto:team@example.com");
    expect(normalizeLinkHref("http://example.com")).toBe("http://example.com");
  });

  it("returns empty for an empty field, which removes the link", () => {
    expect(normalizeLinkHref("   ")).toBe("");
  });
});
