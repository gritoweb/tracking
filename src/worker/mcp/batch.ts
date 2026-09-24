// Batch tools: a list of items in one call, so a person approves once instead of once per item.
import { z, type ZodRawShape } from "zod";
import type { BridgeResult } from "./rest-bridge";
import { compact, json, refuse } from "./shared";

/** Most items one batch call takes: enough for a real list, small enough to review in one approval. */
export const BATCH_MAX = 50;

/** A batch tool's input: `items`, each shaped like the single tool's input. */
export function batchInput<S extends ZodRawShape>(item: S, what: string) {
  return {
    items: z
      .array(z.object(item))
      .min(1)
      .max(BATCH_MAX)
      .describe(`The ${what}, up to ${BATCH_MAX}; each one takes the same fields as the single-item tool`),
  };
}

/** A local check that failed before any request, in the bridge's own shape so single and batch tools report it alike. */
export function rejected<T>(error: string): BridgeResult<T> {
  return { ok: false, status: 400, error };
}

/**
 * Runs the single-item action for each item, in order, and reports every outcome: one failure never hides
 * the others, and nothing is retried. Marked as an error only when no item went through.
 */
export async function runBatch<I, T>(
  items: I[],
  one: (item: I) => Promise<BridgeResult<T>>,
  shape: (data: T) => unknown = (data) => data
) {
  const results: unknown[] = [];
  const failed: { index: number; error: string }[] = [];
  for (const [index, item] of items.entries()) {
    const result = await one(item);
    if (result.ok) results.push(compact(shape(result.data)));
    else failed.push({ index, error: result.error });
  }
  if (results.length === 0) {
    return refuse(`None of the ${items.length} went through: ${failed.map((f) => `#${f.index} ${f.error}`).join("; ")}`);
  }
  return json({ done: results.length, failed, results });
}
