// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { anchorAt, caretRect } from "./caret";

afterEach(() => {
  document.body.innerHTML = "";
});

function field(value: string) {
  const textarea = document.createElement("textarea");
  textarea.value = value;
  document.body.appendChild(textarea);
  return textarea;
}

describe("caretRect", () => {
  it("leaves nothing behind in the page", () => {
    const textarea = field("one\ntwo @De");
    caretRect(textarea, 8);
    expect(document.body.children).toHaveLength(1);
    expect(document.body.firstElementChild).toBe(textarea);
  });

  it("is a zero-width box on the caret, as tall as a line, starting from the field's own position", () => {
    const textarea = field("hello");
    const rect = caretRect(textarea, 3);
    const box = textarea.getBoundingClientRect();
    expect(rect.width).toBe(0);
    expect(rect.height).toBeGreaterThan(0);
    expect(rect.left).toBeGreaterThanOrEqual(box.left);
    expect(rect.top).toBeGreaterThanOrEqual(box.top);
  });

  it("works at the very end of the text and on an empty field", () => {
    expect(() => caretRect(field("abc"), 3)).not.toThrow();
    expect(() => caretRect(field(""), 0)).not.toThrow();
  });
});

describe("anchorAt", () => {
  it("answers with the rect it was given, or an empty one", () => {
    const rect = new DOMRect(1, 2, 3, 4);
    expect(anchorAt(rect).current.getBoundingClientRect()).toBe(rect);
    expect(anchorAt(null).current.getBoundingClientRect().width).toBe(0);
  });
});
