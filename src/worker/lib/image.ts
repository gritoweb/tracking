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

export function sniffImage(bytes: Uint8Array): ImageKind | null {
  return IMAGE_KINDS.find((k) => k.check(bytes)) ?? null;
}

// GIF width/height sit at fixed offsets in the logical screen descriptor (little-endian).
function gifDimensions(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint16(6, true), height: view.getUint16(8, true) };
}

const MAX_EDGE = 2000;

interface ProcessedImage {
  bytes: Uint8Array;
  contentType: string;
  width: number;
  height: number;
}

/** Resize (long edge capped at 2000px) and re-encode to webp; GIF passes through unchanged to keep its animation. */
export function processImage(bytes: Uint8Array, kind: ImageKind): ProcessedImage {
  if (kind.ext === "gif") return { bytes, contentType: kind.contentType, ...gifDimensions(bytes) };

  const input = PhotonImage.new_from_byteslice(bytes);
  const longEdge = Math.max(input.get_width(), input.get_height());
  const scale = longEdge > MAX_EDGE ? MAX_EDGE / longEdge : 1;
  const output =
    scale < 1
      ? resize(input, Math.round(input.get_width() * scale), Math.round(input.get_height() * scale), SamplingFilter.Lanczos3)
      : input;

  const result: ProcessedImage = {
    bytes: output.get_bytes_webp(),
    contentType: "image/webp",
    width: output.get_width(),
    height: output.get_height(),
  };
  input.free();
  if (output !== input) output.free();
  return result;
}
