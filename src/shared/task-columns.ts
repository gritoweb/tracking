// Placing a task among a board's columns without ever reading their names: names are free text, in any language.

type Column = { category: string; sortOrder: number };

/** The same-category column nearest `position`, else the nearest of any category; undefined only for an empty board. */
export function nearestColumn<C extends Column>(columns: C[], category: string | null, position: number | null): C | undefined {
  const sameCategory = columns.filter((c) => c.category === category);
  const pool = sameCategory.length ? sameCategory : columns;
  if (position === null) return pool[0];
  return pool.reduce<C | undefined>(
    (best, c) => (!best || Math.abs(c.sortOrder - position) < Math.abs(best.sortOrder - position) ? c : best),
    undefined
  );
}
