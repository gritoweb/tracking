// The assistant's long-term memory (Tier 3): durable facts the assistant learns about
// one person, stored in D1 (`assistant_memory`). Deliberately simple
// — keyword recall, no embeddings/Vectorize. The chat loop injects a recent
// slice into the system prompt (buildMemoryBlock) and exposes `remember` /
// `search` as tools so the model can persist and look up facts on demand.

const MAX_MEMORIES = 200;
const RECALL_LIMIT = 40;

export interface Memory {
  key: string;
  content: string;
}

export interface StoredMemory extends Memory {
  updatedAt: string;
}

function slugify(key: string): string {
  return key
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Upsert a fact under a stable key so re-learning updates rather than duplicates. */
export async function rememberFact(
  db: D1Database,
  workspaceId: string,
  userId: string,
  key: string,
  content: string
): Promise<{ key: string }> {
  const slug = slugify(key) || `note-${Date.now()}`;
  const now = new Date().toISOString();
  const trimmed = content.trim().slice(0, 1000);

  await db
    .prepare(
      `INSERT INTO assistant_memory (id, workspace_id, user_id, key, content, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (workspace_id, user_id, key)
       DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
    )
    .bind(crypto.randomUUID(), workspaceId, userId, slug, trimmed, now, now)
    .run();

  // Keep the table bounded — prune this person's oldest facts beyond the cap.
  await db
    .prepare(
      `DELETE FROM assistant_memory
       WHERE workspace_id = ?1 AND user_id = ?2
         AND id NOT IN (
           SELECT id FROM assistant_memory WHERE workspace_id = ?1 AND user_id = ?2
           ORDER BY updated_at DESC LIMIT ?3
         )`
    )
    .bind(workspaceId, userId, MAX_MEMORIES)
    .run();

  return { key: slug };
}

/** Most recently updated facts, for injecting into the chat system prompt. */
export async function recallMemories(
  db: D1Database,
  workspaceId: string,
  userId: string
): Promise<Memory[]> {
  const { results } = await db
    .prepare(
      `SELECT key, content FROM assistant_memory
       WHERE workspace_id = ? AND user_id = ? ORDER BY updated_at DESC LIMIT ?`
    )
    .bind(workspaceId, userId, RECALL_LIMIT)
    .all<Memory>();
  return results;
}

/** Keyword OR-search over stored facts (case-insensitive substring match). */
export async function searchMemories(
  db: D1Database,
  workspaceId: string,
  userId: string,
  query: string
): Promise<Memory[]> {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ""))
    .filter((t) => t.length >= 2)
    .slice(0, 6);
  if (!terms.length) return recallMemories(db, workspaceId, userId);

  const clause = terms.map(() => "LOWER(content) LIKE ?").join(" OR ");
  const { results } = await db
    .prepare(
      `SELECT key, content FROM assistant_memory
       WHERE workspace_id = ? AND user_id = ? AND (${clause})
       ORDER BY updated_at DESC LIMIT ?`
    )
    .bind(workspaceId, userId, ...terms.map((t) => `%${t}%`), RECALL_LIMIT)
    .all<Memory>();
  return results;
}

/** All stored facts (newest first) for the Settings management card. */
export async function listMemories(
  db: D1Database,
  workspaceId: string,
  userId: string
): Promise<StoredMemory[]> {
  const { results } = await db
    .prepare(
      `SELECT key, content, updated_at AS updatedAt FROM assistant_memory
       WHERE workspace_id = ? AND user_id = ? ORDER BY updated_at DESC LIMIT ?`
    )
    .bind(workspaceId, userId, MAX_MEMORIES)
    .all<StoredMemory>();
  return results;
}

/** Delete one fact by key. Returns whether a row was removed. */
export async function deleteMemory(
  db: D1Database,
  workspaceId: string,
  userId: string,
  key: string
): Promise<boolean> {
  const res = await db
    .prepare(`DELETE FROM assistant_memory WHERE workspace_id = ? AND user_id = ? AND key = ?`)
    .bind(workspaceId, userId, key)
    .run();
  return (res.meta?.changes ?? 0) > 0;
}

/** Forget everything this person told the assistant in this workspace. */
export async function clearMemories(db: D1Database, workspaceId: string, userId: string): Promise<void> {
  await db
    .prepare(`DELETE FROM assistant_memory WHERE workspace_id = ? AND user_id = ?`)
    .bind(workspaceId, userId)
    .run();
}

/** Plain-text block of known facts for the chat system prompt (empty if none). */
export function buildMemoryBlock(memories: Memory[]): string {
  if (!memories.length) return "";
  return memories.map((m) => `- ${m.content}`).join("\n");
}
