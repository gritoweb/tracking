import { describe, expect, it } from "vitest";
import { ACCEPTED_TYPES, MAX_ATTACHMENT_BYTES, imageProblem } from "./taskCommentAttachments";

const file = (type: string, size = 100) => new File([new Uint8Array(size)], "x", { type });

describe("imageProblem", () => {
  it("accepts every allowed image type", () => {
    for (const type of ACCEPTED_TYPES) expect(imageProblem(file(type))).toBeNull();
  });

  it("refuses anything that is not a png, jpeg, webp or gif, including svg", () => {
    expect(imageProblem(file("text/plain"))).toBe("Only PNG, JPEG, WebP and GIF images are accepted");
    expect(imageProblem(file("image/svg+xml"))).toBe("Only PNG, JPEG, WebP and GIF images are accepted");
  });

  it("refuses a file over 10 MB and accepts one exactly at the limit", () => {
    expect(imageProblem(file("image/png", MAX_ATTACHMENT_BYTES + 1))).toBe("Image is larger than 10 MB");
    expect(imageProblem(file("image/png", MAX_ATTACHMENT_BYTES))).toBeNull();
  });
});
