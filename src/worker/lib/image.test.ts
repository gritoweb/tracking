import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoisted so the mock factory and the tests below can both reach the same spies/state.
const mocks = vi.hoisted(() => ({
  newFromByteslice: vi.fn(),
  freed: [] as unknown[],
  failEncode: false,
}));

// Stubs the workerd Photon binding so importing image.ts doesn't load a real WASM module.
vi.mock("@cf-wasm/photon/workerd", () => {
  class FakePhotonImage {
    constructor(private width = 100, private height = 100) {}
    get_width() { return this.width; }
    get_height() { return this.height; }
    get_bytes_webp() {
      if (mocks.failEncode) throw new Error("encode failed");
      return new Uint8Array([1, 2, 3]);
    }
    free() { mocks.freed.push(this); }
  }
  mocks.newFromByteslice.mockImplementation(() => new FakePhotonImage());
  return {
    PhotonImage: { new_from_byteslice: mocks.newFromByteslice },
    SamplingFilter: { Lanczos3: 1 },
    resize: vi.fn((input: unknown) => input),
  };
});

const { sniffImage, processImage, readImageDimensions, ImageDecodeError } = await import("./image");

beforeEach(() => {
  mocks.newFromByteslice.mockClear();
  mocks.freed.length = 0;
  mocks.failEncode = false;
});

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function ascii(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0));
}

function pngBytes(width: number, height: number, length = 24): Uint8Array {
  const out = new Uint8Array(length);
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  out.set(ascii("IHDR"), 12);
  const view = new DataView(out.buffer);
  if (length >= 20) view.setUint32(16, width);
  if (length >= 24) view.setUint32(20, height);
  return out;
}

function jpegBytes(width: number, height: number): Uint8Array {
  const out = new Uint8Array(30);
  out.set([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08], 0);
  const view = new DataView(out.buffer);
  view.setUint16(7, height);
  view.setUint16(9, width);
  return out;
}

function webpVp8xBytes(width: number, height: number): Uint8Array {
  const out = new Uint8Array(30);
  out.set(ascii("RIFF"), 0);
  out.set(ascii("WEBP"), 8);
  out.set(ascii("VP8X"), 12);
  const w = width - 1;
  const h = height - 1;
  out[24] = w & 0xff; out[25] = (w >> 8) & 0xff; out[26] = (w >> 16) & 0xff;
  out[27] = h & 0xff; out[28] = (h >> 8) & 0xff; out[29] = (h >> 16) & 0xff;
  return out;
}

function webpVp8Bytes(width: number, height: number): Uint8Array {
  const out = new Uint8Array(30);
  out.set(ascii("RIFF"), 0);
  out.set(ascii("WEBP"), 8);
  out.set(ascii("VP8 "), 12);
  out[23] = 0x9d; out[24] = 0x01; out[25] = 0x2a;
  out[26] = width & 0xff; out[27] = (width >> 8) & 0x3f;
  out[28] = height & 0xff; out[29] = (height >> 8) & 0x3f;
  return out;
}

function webpVp8lBytes(width: number, height: number): Uint8Array {
  const out = new Uint8Array(25);
  out.set(ascii("RIFF"), 0);
  out.set(ascii("WEBP"), 8);
  out.set(ascii("VP8L"), 12);
  out[20] = 0x2f;
  const w = width - 1;
  const h = height - 1;
  out[21] = w & 0xff;
  out[22] = ((w >> 8) & 0x3f) | ((h & 0x3) << 6);
  out[23] = (h >> 2) & 0xff;
  out[24] = (h >> 10) & 0x0f;
  return out;
}

function gifBytes(width: number, height: number): Uint8Array {
  const out = new Uint8Array(10);
  out.set(ascii("GIF89a"), 0);
  new DataView(out.buffer).setUint16(6, width, true);
  new DataView(out.buffer).setUint16(8, height, true);
  return out;
}

describe("sniffImage", () => {
  it("recognises a PNG signature", () => {
    const kind = sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0));
    expect(kind?.ext).toBe("png");
    expect(kind?.contentType).toBe("image/png");
  });

  it("recognises a JPEG signature", () => {
    const kind = sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0));
    expect(kind?.ext).toBe("jpg");
  });

  it("recognises a WebP signature at its RIFF offset", () => {
    // Bytes 0-3 are "RIFF", 4-7 the chunk size (irrelevant here), 8-11 "WEBP".
    const kind = sniffImage(bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")));
    expect(kind?.ext).toBe("webp");
  });

  it("recognises a GIF signature", () => {
    const kind = sniffImage(bytes(...ascii("GIF89a")));
    expect(kind?.ext).toBe("gif");
  });

  it("returns null for a forged header claiming PNG but wrong on the third byte", () => {
    expect(sniffImage(bytes(0x89, 0x50, 0x00, 0x00))).toBeNull();
  });

  it("returns null for a forged header claiming JPEG but wrong on the third byte", () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0x00))).toBeNull();
  });

  it("returns null for RIFF bytes that aren't WEBP at the expected offset", () => {
    expect(sniffImage(bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("AVI ")))).toBeNull();
  });

  it("returns null for bytes matching no known signature", () => {
    expect(sniffImage(bytes(0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11))).toBeNull();
  });

  it("returns null for a buffer too short to hold any signature", () => {
    expect(sniffImage(bytes(0x89))).toBeNull();
  });

  it("returns null for an empty buffer", () => {
    expect(sniffImage(new Uint8Array(0))).toBeNull();
  });
});

describe("readImageDimensions", () => {
  it("reads a PNG's IHDR width/height", () => {
    const png = pngBytes(1920, 1080);
    expect(readImageDimensions(png, sniffImage(png)!)).toEqual({ width: 1920, height: 1080 });
  });

  it("returns null for a PNG truncated before the IHDR data", () => {
    const truncated = pngBytes(1920, 1080, 16);
    expect(readImageDimensions(truncated, { ext: "png", contentType: "image/png", check: () => true })).toBeNull();
  });

  it("reads a JPEG's SOF0 width/height", () => {
    const jpeg = jpegBytes(800, 600);
    expect(readImageDimensions(jpeg, sniffImage(jpeg)!)).toEqual({ width: 800, height: 600 });
  });

  it("returns null for a JPEG with no SOF marker before the buffer ends", () => {
    const truncated = bytes(0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00);
    expect(readImageDimensions(truncated, { ext: "jpg", contentType: "image/jpeg", check: () => true })).toBeNull();
  });

  it("reads a VP8X (extended) WebP's canvas width/height", () => {
    const webp = webpVp8xBytes(4000, 3000);
    expect(readImageDimensions(webp, sniffImage(webp)!)).toEqual({ width: 4000, height: 3000 });
  });

  it("reads a VP8 (lossy) WebP's width/height", () => {
    const webp = webpVp8Bytes(640, 480);
    expect(readImageDimensions(webp, sniffImage(webp)!)).toEqual({ width: 640, height: 480 });
  });

  it("reads a VP8L (lossless) WebP's width/height", () => {
    const webp = webpVp8lBytes(100, 100);
    expect(readImageDimensions(webp, sniffImage(webp)!)).toEqual({ width: 100, height: 100 });
  });

  it("returns null for a WebP buffer too short to hold the RIFF header", () => {
    const truncated = bytes(...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP"));
    expect(readImageDimensions(truncated, { ext: "webp", contentType: "image/webp", check: () => true })).toBeNull();
  });

  it("reads a GIF's logical screen descriptor width/height", () => {
    const gif = gifBytes(320, 240);
    expect(readImageDimensions(gif, sniffImage(gif)!)).toEqual({ width: 320, height: 240 });
  });

  it("returns null for a GIF too short to hold the logical screen descriptor", () => {
    const truncated = bytes(...ascii("GIF89a"));
    expect(readImageDimensions(truncated, { ext: "gif", contentType: "image/gif", check: () => true })).toBeNull();
  });
});

describe("processImage — dimension bomb guard", () => {
  it("rejects a forged PNG header declaring 30000x30000 without ever decoding it", () => {
    const png = pngBytes(30000, 30000);
    expect(() => processImage(png, sniffImage(png)!)).toThrow(ImageDecodeError);
    expect(mocks.newFromByteslice).not.toHaveBeenCalled();
  });

  it("rejects a PNG within the edge limit but over the 40-megapixel cap", () => {
    const png = pngBytes(7000, 7000); // 49MP, both sides under 8000px
    expect(() => processImage(png, sniffImage(png)!)).toThrow(ImageDecodeError);
  });

  it("rejects a forged JPEG header declaring an oversized image", () => {
    const jpeg = jpegBytes(9000, 9000);
    expect(() => processImage(jpeg, sniffImage(jpeg)!)).toThrow(ImageDecodeError);
    expect(mocks.newFromByteslice).not.toHaveBeenCalled();
  });

  it("rejects a forged WebP VP8X header declaring an oversized canvas", () => {
    const webp = webpVp8xBytes(20000, 20000);
    expect(() => processImage(webp, sniffImage(webp)!)).toThrow(ImageDecodeError);
    expect(mocks.newFromByteslice).not.toHaveBeenCalled();
  });

  it("throws ImageDecodeError instead of a raw RangeError for a GIF truncated before its dimensions", () => {
    const truncated = bytes(...ascii("GIF89a")); // no room for the 4 dimension bytes
    expect(() => processImage(truncated, sniffImage(truncated)!)).toThrow(ImageDecodeError);
  });

  it("accepts an image right at the edge limit", () => {
    const png = pngBytes(8000, 5000); // under both the edge and the megapixel cap
    expect(() => processImage(png, sniffImage(png)!)).not.toThrow();
  });
});

describe("processImage — decode failures always free the input", () => {
  it("converts a re-encode failure into ImageDecodeError and still frees the Photon image", () => {
    mocks.failEncode = true;
    const png = pngBytes(100, 100);
    expect(() => processImage(png, sniffImage(png)!)).toThrow(ImageDecodeError);
    expect(mocks.freed).toHaveLength(1);
  });
});

describe("processImage — GIF branch (gifDimensions)", () => {
  const gifKind = sniffImage(bytes(...ascii("GIF89a")))!;

  it("reads width/height little-endian from the logical screen descriptor and passes a clean GIF through unchanged", () => {
    // "GIF89a" + 320x240 (LE) + no color table + one 1x1 frame + trailer.
    const gif = bytes(
      ...ascii("GIF89a"), 0x40, 0x01, 0xf0, 0x00, 0, 0, 0,
      0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0x02, 0x02, 0x44, 0x01, 0x00, 0x3b
    );
    const result = processImage(gif, gifKind);
    expect(result).toEqual({ bytes: gif, contentType: "image/gif", width: 320, height: 240 });
  });

  it("rejects a header-only GIF with no frames as ImageDecodeError", () => {
    const gif = bytes(...ascii("GIF89a"), 0x40, 0x01, 0xf0, 0x00, 0, 0);
    expect(() => processImage(gif, gifKind)).toThrow(ImageDecodeError);
  });
});
