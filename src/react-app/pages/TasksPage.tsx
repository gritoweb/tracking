import { useParams } from "react-router-dom";
import { TaskBoardList } from "@/components/tasks/TaskBoardList";

export function TasksPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="h-full">
      <TaskBoardList openTaskId={id ?? null} />
    </div>
  );
}
