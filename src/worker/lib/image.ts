import { PhotonImage, SamplingFilter, resize } from "@cf-wasm/photon/workerd";

interface ImageKind {
  ext: string;
  contentType: string;
  check: (bytes: Uint8Array) => boolean;
}

// Sniffed from content, never trusted from the client's filename/mimetype.
const IMAGE_KINDS: ImageKind[] = [
  { ext: "png", contentType: "image/png", check: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { ext: "jpg", contentType: "image/jpeg", check: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: "webp", contentType: "image/webp", check: (b) => b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50 },
  { ext: "gif", contentType: "image/gif", check: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
];

// A short buffer just fails every check() below (out-of-range reads `undefined`, never a signature byte).
export function sniffImage(bytes: Uint8Array): ImageKind | null {
  return IMAGE_KINDS.find((k) => k.check(bytes)) ?? null;
}

/** Raised for anything wrong with the bytes themselves — the route turns this into a 400, never a 500. */
export class ImageDecodeError extends Error {}

// GIF width/height sit at fixed offsets in the logical screen descriptor (little-endian).
function gifDimensions(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

// PNG: 8-byte signature, then the IHDR chunk's length(4)+type(4), then width/height (4 bytes BE each).
function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

// JPEG: first SOF0-SOF15 marker (excluding DHT/JPG/DAC) carries length+precision+height+width.
function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 9 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
    const length = view.getUint16(offset + 2);
    if (length < 2) return null;
    offset += 2 + length;
  }
  return null;
}

// WebP: RIFF(4) size(4) "WEBP"(4) fourcc(4) chunkSize(4) then format-specific data; VP8L's data is shorter than VP8/VP8X's, so each branch checks its own minimum length.
function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 16) return null;
  const fourcc = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);

  if (fourcc === "VP8X") {
    if (bytes.length < 30) return null;
    const width = (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1;
    const height = (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1;
    return { width, height };
  }
  if (fourcc === "VP8 ") {
    if (bytes.length < 30) return null;
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    return { width: (bytes[26] | (bytes[27] << 8)) & 0x3fff, height: (bytes[28] | (bytes[29] << 8)) & 0x3fff };
  }
  if (fourcc === "VP8L") {
    if (bytes.length < 25 || bytes[20] !== 0x2f) return null;
    const [b0, b1, b2, b3] = [bytes[21], bytes[22], bytes[23], bytes[24]];
    return {
      width: (b0 | ((b1 & 0x3f) << 8)) + 1,
      height: ((b1 >> 6) | (b2 << 2) | ((b3 & 0x0f) << 10)) + 1,
    };
  }
  return null;
}

/** Reads width/height straight from the format header — no decoding, so a forged size can't cost more than a header read. */
export function readImageDimensions(bytes: Uint8Array, kind: ImageKind): { width: number; height: number } | null {
  switch (kind.ext) {
    case "png": return pngDimensions(bytes);
    case "jpg": return jpegDimensions(bytes);
    case "webp": return webpDimensions(bytes);
    case "gif": return bytes.length >= 10 ? gifDimensions(bytes) : null;
    default: return null;
  }
}

// Above this, Photon's decode would allocate more RGBA memory than a Worker isolate has (20000x20000 is ~1.6 GB).
const MAX_INPUT_EDGE = 8000;
const MAX_INPUT_MEGAPIXELS = 40_000_000;

function assertSafeDimensions(bytes: Uint8Array, kind: ImageKind): void {
  const dims = readImageDimensions(bytes, kind);
  if (!dims) throw new ImageDecodeError("Could not read this image's dimensions");
  if (dims.width <= 0 || dims.height <= 0) {
    throw new ImageDecodeError("Image header reports invalid dimensions");
  }
  if (dims.width > MAX_INPUT_EDGE || dims.height > MAX_INPUT_EDGE || dims.width * dims.height > MAX_INPUT_MEGAPIXELS) {
    throw new ImageDecodeError(`Image is too large (${dims.width}x${dims.height})`);
  }
}

const MAX_EDGE = 2000;

const GIF_TRAILER = 0x3b;
const GIF_IMAGE_DESCRIPTOR = 0x2c;
const GIF_EXTENSION = 0x21;
const GIF_LABEL_GRAPHIC_CONTROL = 0xf9;
const GIF_LABEL_PLAIN_TEXT = 0x01;
const GIF_LABEL_APPLICATION = 0xff;
const NETSCAPE_LOOP_ID = "NETSCAPE2.0";

const gifTableBytes = (packed: number) => (packed & 0x80 ? 3 * 2 ** ((packed & 0x07) + 1) : 0);

/** Position just past the 0-terminated sub-block chain starting at `pos`; throws if it runs off the file. */
function endOfGifSubBlocks(bytes: Uint8Array, pos: number): number {
  for (;;) {
    if (pos >= bytes.length) throw new ImageDecodeError("Could not decode this image");
    const size = bytes[pos];
    if (size === 0) return pos + 1;
    pos += 1 + size;
  }
}

/** Rebuilds a GIF from its blocks, keeping frames and the loop count only — no comments, foreign extensions or trailing bytes. */
export function sanitizeGif(bytes: Uint8Array): Uint8Array {
  const malformed = () => new ImageDecodeError("Could not decode this image");
  const version = String.fromCharCode(...bytes.subarray(0, 6));
  if ((version !== "GIF87a" && version !== "GIF89a") || bytes.length < 13) throw malformed();

  let pos = 13 + gifTableBytes(bytes[10]);
  if (pos > bytes.length) throw malformed();
  const chunks: Uint8Array[] = [bytes.subarray(0, pos)];
  let frames = 0;

  for (;;) {
    if (pos >= bytes.length) throw malformed();
    const introducer = bytes[pos];

    if (introducer === GIF_TRAILER) {
      if (frames === 0) throw malformed();
      chunks.push(bytes.subarray(pos, pos + 1));
      break;
    }

    if (introducer === GIF_IMAGE_DESCRIPTOR) {
      if (pos + 10 > bytes.length) throw malformed();
      const dataStart = pos + 10 + gifTableBytes(bytes[pos + 9]) + 1; // +1: LZW minimum code size
      if (dataStart > bytes.length) throw malformed();
      const next = endOfGifSubBlocks(bytes, dataStart);
      chunks.push(bytes.subarray(pos, next));
      frames++;
      pos = next;
      continue;
    }

    if (introducer === GIF_EXTENSION) {
      if (pos + 2 > bytes.length) throw malformed();
      const label = bytes[pos + 1];
      const next = endOfGifSubBlocks(bytes, pos + 2);
      if (label === GIF_LABEL_GRAPHIC_CONTROL || label === GIF_LABEL_PLAIN_TEXT) {
        chunks.push(bytes.subarray(pos, next));
      } else if (label === GIF_LABEL_APPLICATION && bytes[pos + 2] === 0x0b) {
        const id = String.fromCharCode(...bytes.subarray(pos + 3, pos + 14));
        const hasLoopCount = bytes[pos + 14] === 0x03 && bytes[pos + 15] === 0x01;
        // Only the 3-byte loop sub-block is rebuilt; any other sub-block in the extension is dropped.
        if (id === NETSCAPE_LOOP_ID && hasLoopCount) {
          chunks.push(bytes.subarray(pos, pos + 18), new Uint8Array([0x00]));
        }
      }
      pos = next;
      continue;
    }

    throw malformed();
  }

  const out = new Uint8Array(chunks.reduce((n, chunk) => n + chunk.length, 0));
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}

interface ProcessedImage {
  bytes: Uint8Array;
  contentType: string;
  width: number;
  height: number;
}

/** Resize (long edge capped at 2000px) and re-encode to webp; GIF keeps its frames (animation) but is rebuilt without non-frame bytes. */
export function processImage(bytes: Uint8Array, kind: ImageKind): ProcessedImage {
  assertSafeDimensions(bytes, kind);
  if (kind.ext === "gif") return { bytes: sanitizeGif(bytes), contentType: kind.contentType, ...gifDimensions(bytes) };

  let input: PhotonImage | undefined;
  let output: PhotonImage | undefined;
  try {
    input = PhotonImage.new_from_byteslice(bytes);
    const longEdge = Math.max(input.get_width(), input.get_height());
    const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1;
    output =
      scale < 1
        ? resize(input, Math.round(input.get_width() * scale), Math.round(input.get_height() * scale), SamplingFilter.Lanczos3)
        : input;

    return {
      bytes: output.get_bytes_webp(),
      contentType: "image/webp",
      width: output.get_width(),
      height: output.get_height(),
    };
  } catch (e) {
    console.warn("image decode failed", { ext: kind.ext, error: String(e) });
    throw new ImageDecodeError("Could not decode this image");
  } finally {
    if (output && output !== input) output.free();
    input?.free();
  }
}
