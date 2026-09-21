/** Radix anchors a popover to anything that can say where it is, which is all a caret or a chip is. */
export const anchorAt = (rect: DOMRect | null) => ({ current: { getBoundingClientRect: () => rect ?? new DOMRect() } });

const MIRRORED_STYLES = [
  "direction", "boxSizing", "width", "height", "overflowX", "overflowY",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
  "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize", "fontFamily",
  "lineHeight", "textAlign", "textTransform", "textIndent", "letterSpacing", "wordSpacing", "tabSize",
] as const;

/** Where character `index` of a textarea is on screen: the text before it is laid out in a hidden copy with the same font, width and wrapping. */
export function caretRect(field: HTMLTextAreaElement, index: number): DOMRect {
  const style = getComputedStyle(field);
  const mirror = document.createElement("div");
  for (const name of MIRRORED_STYLES) mirror.style[name] = style[name];
  Object.assign(mirror.style, { position: "absolute", visibility: "hidden", top: "0", left: "-9999px", whiteSpace: "pre-wrap", overflowWrap: "break-word" });
  mirror.textContent = field.value.slice(0, index);
  // A character after the caret makes the span exist even at the end of the text.
  const marker = document.createElement("span");
  marker.textContent = field.value.slice(index) || ".";
  mirror.appendChild(marker);
  document.body.appendChild(mirror);
  const offsetTop = marker.offsetTop;
  const offsetLeft = marker.offsetLeft;
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;
  mirror.remove();
  const box = field.getBoundingClientRect();
  return new DOMRect(box.left + offsetLeft - field.scrollLeft, box.top + offsetTop - field.scrollTop, 0, lineHeight);
}
