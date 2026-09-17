import { describe, expect, it, vi } from "vitest";

// Stubs the workerd Photon binding so importing image.ts doesn't load a real WASM module; the GIF branch tested below never calls it.
vi.mock("@cf-wasm/photon/workerd", () => ({
  PhotonImage: class {},
  SamplingFilter: { Lanczos3: 1 },
  resize: vi.fn(),
}));

const { sniffImage, processImage } = await import("./image");

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values);
}

function ascii(text: string): number[] {
  return [...text].map((c) => c.charCodeAt(0));
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

describe("processImage — GIF branch (gifDimensions)", () => {
  const gifKind = sniffImage(bytes(...ascii("GIF89a")))!;

  it("reads width/height little-endian from the logical screen descriptor and passes bytes through unchanged", () => {
    // "GIF89a" (6) + width=320 (2, LE) + height=240 (2, LE) + 2 more bytes of padding.
    const gif = bytes(...ascii("GIF89a"), 0x40, 0x01, 0xf0, 0x00, 0, 0);
    const result = processImage(gif, gifKind);
    expect(result).toEqual({ bytes: gif, contentType: "image/gif", width: 320, height: 240 });
  });

  it("throws rather than silently misreading a buffer truncated before the dimensions", () => {
    const truncated = bytes(...ascii("GIF89a")); // no room for the 4 dimension bytes
    expect(() => processImage(truncated, gifKind)).toThrow(RangeError);
  });
});
