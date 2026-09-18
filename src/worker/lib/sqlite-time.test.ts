import { describe, expect, it } from "vitest";
import { sqliteUtcToIso, sqliteUtcToIsoOrNull } from "./sqlite-time";

describe("sqliteUtcToIso", () => {
  it("marks a bare SQLite timestamp as UTC so every timezone reads the same instant", () => {
    const iso = sqliteUtcToIso("2026-09-18 17:47:12");
    expect(iso).toBe("2026-09-18T17:47:12Z");
    expect(new Date(iso).getTime()).toBe(Date.UTC(2026, 8, 18, 17, 47, 12));
  });

  it("leaves an ISO string alone", () => {
    expect(sqliteUtcToIso("2026-09-18T17:47:12.000Z")).toBe("2026-09-18T17:47:12.000Z");
  });

  it("passes null and empty through as null", () => {
    expect(sqliteUtcToIsoOrNull(null)).toBeNull();
    expect(sqliteUtcToIsoOrNull(undefined)).toBeNull();
    expect(sqliteUtcToIsoOrNull("2026-09-18 17:47:12")).toBe("2026-09-18T17:47:12Z");
  });
});
