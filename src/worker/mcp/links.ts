// The openable URLs a tool result carries, so a person can click through from a chat or an MCP client.
import { taskPath, type TaskTab } from "@shared/task-links";

export const taskUrl = (base: string, taskId: string, tab: TaskTab = "task"): string => `${base}${taskPath(taskId, tab)}`;

/**
 * The Timer opened on the day an entry started (its UTC date: near midnight the week view still
 * contains it), highlighting that one entry. The id makes this link proof a write really happened —
 * unlike the date alone, a model can't guess it, so it can't fabricate a convincing "done" link for
 * an entry that was never created (SECURITY.md-adjacent: the Assistant's tool-approval gate).
 */
export const entryUrl = (base: string, startIso: string, id: string): string =>
  `${base}/?date=${startIso.slice(0, 10)}&entry=${id}`;
