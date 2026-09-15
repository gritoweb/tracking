import type { TimeEntry, CreateTimeEntry } from "@shared/schemas";

/** What recreates a deleted entry for Undo; null for an older entry without a project, which can't be recreated (D3). */
export function toCreatePayload(entry: TimeEntry): CreateTimeEntry | null {
  if (!entry.projectId) return null;
  return {
    description: entry.description,
    projectId: entry.projectId,
    taskId: entry.taskId,
    start: entry.start,
    stop: entry.stop,
    billable: entry.billable,
    tags: entry.tags,
  };
}
