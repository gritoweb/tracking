// The openable URLs a tool result carries, so a person can click through from a chat or an MCP client.
import { taskPath, type TaskTab } from "@shared/task-links";

export const taskUrl = (base: string, taskId: string, tab: TaskTab = "task"): string => `${base}${taskPath(taskId, tab)}`;

/** The Timer opened on the day an entry started (its UTC date: near midnight the week view still contains it). */
export const entryUrl = (base: string, startIso: string): string => `${base}/?date=${startIso.slice(0, 10)}`;
