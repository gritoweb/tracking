// SQLite's datetime('now') is UTC without a zone marker, and a browser reads that bare string as local time.
export function sqliteUtcToIso(value: string): string {
  if (value.includes("T")) return value;
  return `${value.replace(" ", "T")}Z`;
}

export function sqliteUtcToIsoOrNull(value: string | null | undefined): string | null {
  return value ? sqliteUtcToIso(value) : null;
}
