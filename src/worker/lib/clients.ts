import type { Client, CreateClient } from "@shared/schemas";
import type { ClientRow } from "../db/rows";

export function formatClient(row: ClientRow): Client {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    notes: row.notes ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
    archived: Boolean(row.archived),
    createdAt: row.created_at,
  };
}

/** Whether `clientId` is an active (not archived) client of this workspace — the only kind a project may belong to. */
export async function isActiveClient(db: D1Database, workspaceId: string, clientId: string): Promise<boolean> {
  const row = await db
    .prepare(`SELECT 1 FROM clients WHERE id = ? AND workspace_id = ? AND archived = 0`)
    .bind(clientId, workspaceId)
    .first();
  return row !== null;
}

/** Shared by the REST route and the MCP `create_client` tool. */
export async function createClient(db: D1Database, workspaceId: string, data: CreateClient): Promise<Client> {
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
    .first<ClientRow>();
  if (!row) throw new Error("client insert did not produce a readable row");

  return formatClient(row);
}
