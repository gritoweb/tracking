import { describe, expect, it } from "vitest";
import { MAX_ATTACHMENT_BYTES } from "@shared/attachments";
import { IMAGE_TYPES, attachmentProblem, imageProblem } from "./taskCommentAttachments";

const file = (name: string, type: string) => new File([new Uint8Array(1)], name, { type });
const sized = (name: string, type: string, size: number) => {
  const f = file(name, type);
  Object.defineProperty(f, "size", { value: size });
  return f;
};

describe("imageProblem (description and comments)", () => {
  it("accepts the four image types", () => {
    for (const type of IMAGE_TYPES) expect(imageProblem(file("a", type))).toBeNull();
  });

  it("refuses anything else, including SVG and PDF", () => {
    expect(imageProblem(file("a.svg", "image/svg+xml"))).toMatch(/Only PNG, JPEG, WebP and GIF/);
    expect(imageProblem(file("a.pdf", "application/pdf"))).toMatch(/Only PNG, JPEG, WebP and GIF/);
  });

  it("refuses an image over the shared limit, and accepts one exactly at it", () => {
    expect(imageProblem(sized("a.png", "image/png", MAX_ATTACHMENT_BYTES + 1))).toBe("Image is larger than 25 MB");
    expect(imageProblem(sized("a.png", "image/png", MAX_ATTACHMENT_BYTES))).toBeNull();
  });
});

describe("attachmentProblem (the Attachments section)", () => {
  it("accepts documents by extension, whatever mimetype the browser reports", () => {
    for (const name of ["a.pdf", "a.docx", "a.xlsx", "a.pptx", "a.txt", "a.csv", "a.PNG", "a.jpeg"]) {
      expect(attachmentProblem(file(name, ""))).toBeNull();
    }
  });

  it("refuses programs, scripts, macro documents, archives, SVG and HTML", () => {
    for (const name of ["a.exe", "a.js", "a.docm", "a.xlsm", "a.zip", "a.svg", "a.html", "a.doc", "noextension"]) {
      expect(attachmentProblem(file(name, ""))).toMatch(/^Only images/);
    }
  });

  it("refuses a file over the shared limit", () => {
    expect(attachmentProblem(sized("a.pdf", "application/pdf", MAX_ATTACHMENT_BYTES + 1))).toBe("File is larger than 25 MB");
  });
});
