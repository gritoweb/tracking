/** The page numbers to show: first, last, and the neighbours of the current one, with "…" for the gaps. */
export function pageItems(page: number, pageCount: number): (number | "gap")[] {
  const keep = new Set([1, pageCount, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pageCount));
  const items: (number | "gap")[] = [];
  let last = 0;
  for (const n of [...keep].sort((a, b) => a - b)) {
    if (n - last === 2) items.push(last + 1);
    else if (n - last > 2) items.push("gap");
    items.push(n);
    last = n;
  }
  return items;
}
