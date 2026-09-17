import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { parseJsonColumn } from "./json";

const stringArray = z.array(z.string());

describe("parseJsonColumn", () => {
  it("returns the fallback for null/undefined/empty input", () => {
    expect(parseJsonColumn(null, stringArray, [], "ctx")).toEqual([]);
    expect(parseJsonColumn(undefined, stringArray, [], "ctx")).toEqual([]);
    expect(parseJsonColumn("", stringArray, [], "ctx")).toEqual([]);
  });

  it("parses and validates well-formed JSON", () => {
    expect(parseJsonColumn('["a","b"]', stringArray, [], "ctx")).toEqual(["a", "b"]);
  });

  it("logs and falls back on invalid JSON", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseJsonColumn("not json", stringArray, [], "tags")).toEqual([]);
    expect(warn).toHaveBeenCalledWith("tags: invalid JSON", expect.objectContaining({ error: expect.any(String) }));
    warn.mockRestore();
  });

  it("logs and falls back when the parsed value fails the schema", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(parseJsonColumn('[1,2,3]', stringArray, [], "tags")).toEqual([]);
    expect(warn).toHaveBeenCalledWith("tags: JSON failed schema validation", expect.objectContaining({ error: expect.any(String) }));
    warn.mockRestore();
  });

  it("never throws on malformed input", () => {
    expect(() => parseJsonColumn("{", stringArray, [], "ctx")).not.toThrow();
  });
});
