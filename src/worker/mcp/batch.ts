// Tools that take a list: one item as always, or `items` for several in one call — so a person approves once, not once per item.
import { z, type ZodRawShape } from "zod";
import type { BridgeResult } from "./rest-bridge";
import { compact, fromBridge, json, refuse } from "./shared";

/** Most items one call takes: enough for a real list, small enough to review in one approval. */
export const BATCH_MAX = 50;

/** A tool's input that takes one item exactly as before, or `items` for several of the same. */
export function listableInput<S extends ZodRawShape>(shape: S, what: string, max = BATCH_MAX) {
  return {
    ...z.object(shape).partial().shape,
    items: z
      .array(z.object(shape))
      .min(1)
      .max(max)
      .optional()
      .describe(
        `Several ${what} in ONE call (one approval), up to ${max}, each with the same fields as a single one. Use it instead of calling this tool once per item; leave the single-item fields out when you pass it.`
      ),
  } as ZodRawShape;
}

/** A local check that failed before any request, in the bridge's own shape so it is reported like the server's own refusals. */
export function rejected<T>(error: string): BridgeResult<T> {
  return { ok: false, status: 400, error };
}

/**
 * Runs a listable tool. With `items`, each goes through `one` in order and every outcome is reported — one failure never
 * hides the others, nothing is retried, and it is an error only when none went through. Without, the single item is
 * validated and answered exactly as the tool always did.
 */
export async function runListable<S extends ZodRawShape, T>(
  shape: S,
  args: Record<string, unknown>,
  one: (item: z.infer<z.ZodObject<S>>) => Promise<BridgeResult<T>>,
  view: (data: T) => unknown = (data) => data,
  /** For a route that already takes a whole list (the entries' `/bulk`): all of `items` in one request, all or nothing. */
  many?: (items: z.infer<z.ZodObject<S>>[]) => Promise<BridgeResult<unknown>>
) {
  const { items, ...single } = args;
  if (Array.isArray(items) && many) return fromBridge(await many(items as z.infer<z.ZodObject<S>>[]));
  if (Array.isArray(items)) {
    const results: unknown[] = [];
    const failed: { index: number; error: string }[] = [];
    for (const [index, item] of (items as z.infer<z.ZodObject<S>>[]).entries()) {
      const result = await one(item);
      if (result.ok) results.push(compact(view(result.data)));
      else failed.push({ index, error: result.error });
    }
    if (results.length === 0) {
      return refuse(`None of the ${items.length} went through: ${failed.map((f) => `#${f.index} ${f.error}`).join("; ")}`);
    }
    return json({ done: results.length, failed, results });
  }
  const parsed = z.object(shape).safeParse(single);
  if (!parsed.success) {
    return refuse(parsed.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; "));
  }
  return fromBridge(await one(parsed.data), view);
}
