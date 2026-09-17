import type { ZodType } from "zod";

/** Parses+validates JSON from a D1 column, logging and returning `fallback` on any failure instead of throwing or trusting unvalidated data. */
export function parseJsonColumn<T>(
  json: string | null | undefined,
  schema: ZodType<T>,
  fallback: T,
  context: string
): T {
  if (!json) return fallback;

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    console.warn(`${context}: invalid JSON`, { error: String(e) });
    return fallback;
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    console.warn(`${context}: JSON failed schema validation`, { error: result.error.message });
    return fallback;
  }
  return result.data;
}
