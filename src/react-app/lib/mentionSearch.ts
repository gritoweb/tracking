import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";

export const MAX_SUGGESTIONS = 6;

const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

/** Members whose name or e-mail contains the query (accents and case ignored), each person once, capped for a short list. */
export function filterMembers(members: WorkspaceMember[], query: string, limit = MAX_SUGGESTIONS): WorkspaceMember[] {
  const q = fold(query);
  const seen = new Set<string>();
  return members
    .filter((m) => (fold(m.name).includes(q) || fold(m.email).includes(q)) && !seen.has(m.userId) && seen.add(m.userId))
    .slice(0, limit);
}
