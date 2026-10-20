import { describe, expect, it } from "vitest";
import { splitAttachedFiles, withAttachedFiles } from "./useStagedFiles";

describe("withAttachedFiles", () => {
  it("lists each staged file's uploadId under the person's words", () => {
    expect(withAttachedFiles("Put this in task X", [{ name: "shot.png", uploadId: "u1" }, { name: "spec.pdf", uploadId: "u2" }])).toBe(
      "Put this in task X\n\nAttached files (pass these as uploadIds):\n- shot.png (uploadId: u1)\n- spec.pdf (uploadId: u2)"
    );
  });

  it("shows the person their words and the files by name, without the ids", () => {
    const sent = withAttachedFiles("Put this in task X", [{ name: "my shot (1).png", uploadId: "u1" }, { name: "spec.pdf", uploadId: "u2" }]);
    expect(splitAttachedFiles(sent)).toEqual({ text: "Put this in task X", files: ["my shot (1).png", "spec.pdf"] });
    expect(splitAttachedFiles("no files here")).toEqual({ text: "no files here", files: [] });
  });

  it("leaves the text alone when no file finished uploading", () => {
    expect(withAttachedFiles("hi", [{ name: "shot.png" }])).toBe("hi");
  });
});
