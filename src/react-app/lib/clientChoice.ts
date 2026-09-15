import type { Client } from "@shared/schemas";

/** An existing client, or the name of one to create with the project. */
export interface ClientChoice {
  clientId: string;
  newName: string;
}

export const NO_CLIENT: ClientChoice = { clientId: "", newName: "" };

export function hasClient(choice: ClientChoice): boolean {
  return Boolean(choice.clientId || choice.newName.trim());
}

/** The client id to save under, creating the client first; a name that already exists selects it instead. */
export async function resolveClientId(
  choice: ClientChoice,
  clients: Client[],
  createClient: (data: { name: string }) => Promise<Client>
): Promise<string> {
  if (choice.clientId) return choice.clientId;
  const name = choice.newName.trim();
  const existing = clients.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  return (await createClient({ name })).id;
}
