export interface PlannerRowMeta {
  key: string;
  projectId: string | null;
  taskId: string | null;
  projectName: string | null;
  projectColor: string | null;
  taskName: string | null;
}

export interface PlanCell {
  planned: number;
  actual: number;
}

export const rowKeyOf = (projectId: string | null, taskId: string | null) =>
  `${projectId ?? ""}__${taskId ?? ""}`;
