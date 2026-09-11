import type { CreateClient } from "@shared/schemas";

export function formatClient(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    workspaceId: row.workspace_id as string,
    name: row.name as string,
    notes: (row.notes as string | null) ?? null,
    email: (row.email as string | null) ?? null,
    phone: (row.phone as string | null) ?? null,
    address: (row.address as string | null) ?? null,
    archived: Boolean(row.archived),
    createdAt: row.created_at as string,
  };
}

/** Shared by the REST route and the MCP `create_client` tool. */
export async function createClient(db: D1Database, workspaceId: string, data: CreateClient) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .prepare(
      `INSERT INTO clients (id, workspace_id, name, notes, email, phone, address, archived, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`
    )
    .bind(
      id,
      workspaceId,
      data.name,
      data.notes ?? null,
      data.email ?? null,
      data.phone ?? null,
      data.address ?? null,
      now
    )
    .run();

  const row = await db
    .prepare(`SELECT * FROM clients WHERE id = ? AND workspace_id = ?`)
    .bind(id, workspaceId)
    .first<Record<string, unknown>>();

  return formatClient(row!);
}
