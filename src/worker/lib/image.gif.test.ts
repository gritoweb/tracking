import { describe, expect, it, vi } from "vitest";

// Stubs the workerd Photon binding so importing image.ts doesn't load a real WASM module (GIF never reaches it).
vi.mock("@cf-wasm/photon/workerd", () => ({
  PhotonImage: { new_from_byteslice: vi.fn() },
  SamplingFilter: { Lanczos3: 1 },
  resize: vi.fn(),
}));

const { processImage, sniffImage, ImageDecodeError } = await import("./image");

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const cat = (...parts: number[][]) => parts.flat();
const subBlocks = (...blocks: number[][]) => cat(...blocks.map((b) => [b.length, ...b]), [0x00]);

const NETSCAPE_LOOP = [0x21, 0xff, 0x0b, ...ascii("NETSCAPE2.0"), 0x03, 0x01, 0x00, 0x00, 0x00];
const commentBlock = (text: string) => [0x21, 0xfe, ...subBlocks(ascii(text))];
const appBlock = (id: string, payload: string) => [0x21, 0xff, 0x0b, ...ascii(id), ...subBlocks(ascii(payload))];
const graphicControl = (delay: number) => [0x21, 0xf9, 0x04, 0x00, delay & 0xff, delay >> 8, 0x00, 0x00];
const frame = (width: number, height: number, delay: number, marker: number) => [
  ...graphicControl(delay),
  0x2c, 0, 0, 0, 0, width & 0xff, width >> 8, height & 0xff, height >> 8, 0x00,
  0x02, ...subBlocks([0x44, marker, 0x01]),
];

interface GifOptions {
  version?: "GIF87a" | "GIF89a";
  width?: number;
  height?: number;
  frames?: number;
  loop?: boolean;
  beforeFirstFrame?: number[];
  betweenFrames?: number[];
  afterTrailer?: number[];
}

function gif(o: GifOptions = {}): Uint8Array {
  const { version = "GIF89a", width = 1, height = 1, frames = 1, loop = false } = o;
  const screen = [width & 0xff, width >> 8, height & 0xff, height >> 8, 0x80, 0x00, 0x00];
  const colorTable = [0x00, 0x00, 0x00, 0xff, 0xff, 0xff];
  const body: number[] = [];
  for (let i = 0; i < frames; i++) {
    if (i > 0) body.push(...(o.betweenFrames ?? []));
    body.push(...frame(width, height, 10 + i, 0x10 + i));
  }
  return new Uint8Array(cat(ascii(version), screen, colorTable, loop ? NETSCAPE_LOOP : [], o.beforeFirstFrame ?? [], body, [0x3b], o.afterTrailer ?? []));
}

const gifKind = (bytes: Uint8Array) => sniffImage(bytes)!;
const sanitized = (bytes: Uint8Array) => processImage(bytes, gifKind(bytes)).bytes;
const latin1 = (bytes: Uint8Array) => new TextDecoder("latin1").decode(bytes);
const contains = (haystack: Uint8Array, needle: string) => latin1(haystack).includes(needle);
const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((byte, i) => byte === b[i]);

describe("S-22 — GIF structure is sanitized instead of passed through", () => {
  it("drops a Comment Extension and everything after the trailer, leaving the frames byte-identical", () => {
    const clean = gif({ frames: 3, loop: true });
    const dirty = gif({
      frames: 3,
      loop: true,
      beforeFirstFrame: commentBlock("INJECTED-COMMENT-1"),
      betweenFrames: commentBlock("INJECTED-COMMENT-2"),
      afterTrailer: ascii("<script>INJECTED-TAIL</script>"),
    });
    expect(contains(dirty, "INJECTED-COMMENT-1")).toBe(true);

    const out = sanitized(dirty);
    expect(contains(out, "INJECTED")).toBe(false);
    expect(same(out, clean)).toBe(true);
  });

  it("drops Application Extensions other than NETSCAPE2.0 but keeps the loop block", () => {
    const clean = gif({ frames: 2, loop: true });
    const dirty = gif({ frames: 2, loop: true, beforeFirstFrame: appBlock("EVILAPP1234", "INJECTED-APP-PAYLOAD"), betweenFrames: appBlock("XMP DataXMP", "INJECTED-XMP") });
    const out = sanitized(dirty);
    expect(contains(out, "INJECTED")).toBe(false);
    expect(contains(out, "NETSCAPE2.0")).toBe(true);
    expect(same(out, clean)).toBe(true);
  });

  it("keeps only the loop count of a NETSCAPE2.0 block and drops data smuggled into its extra sub-blocks", () => {
    const smuggled = [0x21, 0xff, 0x0b, ...ascii("NETSCAPE2.0"), 0x03, 0x01, 0x05, 0x00, ...subBlocks(ascii("INJECTED-NS")).slice(0, -1), 0x00];
    const out = sanitized(gif({ frames: 2, beforeFirstFrame: smuggled }));
    expect(contains(out, "INJECTED")).toBe(false);
    const at = latin1(out).indexOf("NETSCAPE2.0");
    expect([...out.subarray(at + 11, at + 16)]).toEqual([0x03, 0x01, 0x05, 0x00, 0x00]);
  });

  it("returns a still-valid GIF: header, screen size, every image block and the trailer survive", () => {
    const out = sanitized(gif({ version: "GIF87a", frames: 3, width: 4, height: 2, loop: true, afterTrailer: [1, 2, 3, 4] }));
    expect(latin1(out.subarray(0, 6))).toBe("GIF87a");
    expect([out[6], out[8]]).toEqual([4, 2]);
    expect(out[out.length - 1]).toBe(0x3b);
    const descriptors = [...out].reduce((n, b, i) => n + (b === 0x2c && out[i + 5] === 4 && out[i + 7] === 2 ? 1 : 0), 0);
    expect(descriptors).toBe(3);
  });

  it("passes a real 1x1 GIF through unchanged, reporting its dimensions", () => {
    const one = gif();
    const result = processImage(one, gifKind(one));
    expect(same(result.bytes, one)).toBe(true);
    expect([result.width, result.height, result.contentType]).toEqual([1, 1, "image/gif"]);
  });

  it("keeps a local color table and the graphic control's delay", () => {
    const local = new Uint8Array(cat(
      ascii("GIF89a"), [1, 0, 1, 0, 0x00, 0, 0],
      graphicControl(77),
      [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x80], [9, 9, 9, 8, 8, 8],
      [0x02], subBlocks([0x44, 0x01]), [0x3b]
    ));
    expect(same(sanitized(local), local)).toBe(true);
  });
});

describe("S-22 — malformed GIFs are rejected like every other bad image", () => {
  const good = [...gif({ frames: 2, loop: true })];
  const cases: [string, number[]][] = [
    ["header only", ascii("GIF89a")],
    ["a wrong version", [...ascii("GIF88a"), ...good.slice(6)]],
    ["no trailer (truncated file)", good.slice(0, -1)],
    ["truncated inside an image data sub-block", good.slice(0, good.length - 6)],
    ["a sub-block length running past the end", [...good.slice(0, 13 + 6), 0x21, 0xfe, 0xff, 0x41]],
    ["an unknown block introducer", [...good.slice(0, 19), 0x99, ...good.slice(19)]],
    ["no image at all", [...good.slice(0, 19), 0x3b]],
  ];
  it.each(cases)("throws ImageDecodeError for %s", (_name, raw) => {
    const bytes = new Uint8Array(raw);
    expect(() => processImage(bytes, gifKind(bytes))).toThrow(ImageDecodeError);
  });
});
