// A task's shareable URL: the task tab is the bare id, the comments tab adds a segment.
export type TaskTab = "task" | "comments";

export function taskPath(taskId: string, tab: TaskTab = "task"): string {
  return tab === "comments" ? `/tasks/${taskId}/comments` : `/tasks/${taskId}`;
}

/** Anything but "comments" is the task tab, so a mistyped URL still lands somewhere sensible. */
export function parseTaskTab(segment: string | undefined): TaskTab {
  return segment === "comments" ? "comments" : "task";
}
