// D1 allows 100 bound parameters per statement; a chunk plus the fixed binds of a bulk statement stays under it.
export const BULK_CHUNK_SIZE = 90;

export function chunked<T>(items: T[]): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += BULK_CHUNK_SIZE) chunks.push(items.slice(i, i + BULK_CHUNK_SIZE));
  return chunks;
}

export const placeholdersFor = (ids: string[]) => ids.map(() => "?").join(",");
