import { useParams } from "react-router-dom";
import { TaskBoardList } from "@/components/tasks/TaskBoardList";
import { parseTaskTab } from "@shared/task-links";

export function TasksPage() {
  const { id, tab } = useParams<{ id: string; tab: string }>();
  return (
    <div className="h-full">
      <TaskBoardList openTaskId={id ?? null} openTab={parseTaskTab(tab)} />
    </div>
  );
}
