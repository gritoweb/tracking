import { taskPath, type TaskTab } from "@shared/task-links";
import { useTaskImageUpload } from "@/hooks/useTaskImageUpload";
import { useSyncedField } from "@/hooks/useSyncedField";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { TaskDetailToolbar } from "./TaskDetailToolbar";
import { TaskModalShell } from "./TaskModalShell";
import { TaskSidebarShell } from "./TaskSidebarShell";
import { TaskTitle } from "./TaskTitle";
import { TaskParentLink } from "./TaskParentLink";
import { TaskProperties } from "./TaskProperties";
import { TaskDescriptionField } from "./TaskDescriptionField";
import { TaskSubtasks } from "./TaskSubtasks";
import { TaskAttachments } from "./TaskAttachments";
import { TaskComments } from "./TaskComments";
import { useTaskComments } from "@/hooks/useTaskComments";
import {
  useAllTasks,
  useCompleteTask,
  useUpdateTask,
  useTaskAttachments,
  useDeleteTaskAttachment,
} from "@/hooks/useTasks";
import { useWorkspaceMembers } from "@/hooks/useWorkspaceRole";
import { useMediaQuery, BELOW_LG } from "@/hooks/useMediaQuery";
import { useTimer } from "@/hooks/useTimer";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import { parseTimeInput, formatTimeInput } from "@/lib/dateUtils";
import { serializeDescription } from "@/lib/richText";
import type { Task, TaskAttachment } from "@shared/schemas";
import type { JSONContent } from "@tiptap/react";

interface TaskDetailProps {
  open: boolean;
  onClose: () => void;
  task: Task | null;
  /** The active tab lives in the URL, so a copied link reopens on the same one. */
  tab: TaskTab;
  onTabChange: (tab: TaskTab) => void;
  onRequestDelete: (task: Task) => void;
}

/**
 * A task's detail, opened as a modal (default) or a sidebar — the person's choice, kept per browser.
 * Every field autosaves on change/blur, the same pattern `TaskRow`'s inline edits already use.
 *
 * Controller: owns hooks/mutations/state and builds each block once; the two shells only lay them out.
 */
export function TaskDetail({ open, onClose, task, tab, onTabChange, onRequestDelete }: TaskDetailProps) {
  const navigate = useNavigate();
  const mode = useUIStore((s) => s.taskViewMode);
  const setMode = useUIStore((s) => s.setTaskViewMode);
  const narrow = useMediaQuery(BELOW_LG);
  const updateTask = useUpdateTask();
  const completeTask = useCompleteTask();
  const { data: members = [], isPending: membersLoading } = useWorkspaceMembers(open);
  const { data: allTasks = [] } = useAllTasks();
  const { data: attachments = [], isLoading: attachmentsLoading } = useTaskAttachments(task?.id ?? null);
  const { data: comments = [] } = useTaskComments(task?.id ?? null);
  const deleteAttachment = useDeleteTaskAttachment();
  const { uploadImage, deleteOrphanedImage } = useTaskImageUpload(task?.id ?? null);
  const { startTimer, stopTimer } = useTimer();
  const runningEntry = useTimerStore((s) => s.runningEntry);

  // Both follow the server (another person's edit shows up) unless the person is mid-edit.
  const [name, setName] = useSyncedField(task?.name ?? "", task?.id ?? null);
  const [estimate, setEstimate] = useSyncedField(formatTimeInput(task?.estimatedSeconds ?? null), task?.id ?? null);
  const [dueOpen, setDueOpen] = useState(false);
  const [lightbox, setLightbox] = useState<TaskAttachment | null>(null);

  if (!task) return null;

  const isSubtask = Boolean(task.parentId);
  const subtasks = allTasks.filter((t) => t.parentId === task.id);
  const running = runningEntry?.taskId === task.id;
  const commentsCount = Math.max(task.commentCount, comments.length);

  const saveName = () => {
    const trimmed = name.trim();
    if (trimmed && trimmed !== task.name) updateTask.mutate({ id: task.id, data: { name: trimmed } });
    else setName(task.name);
  };

  const saveDescription = (doc: JSONContent) => {
    const serialized = serializeDescription(doc);
    if (serialized !== task.description) {
      updateTask.mutate({ id: task.id, data: { description: serialized } });
    }
  };

  const saveEstimate = () => {
    const trimmed = estimate.trim();
    const parsed = trimmed ? parseTimeInput(trimmed) : null;
    if (trimmed === "" || parsed !== null) {
      updateTask.mutate({ id: task.id, data: { estimatedSeconds: parsed } });
    } else {
      setEstimate(formatTimeInput(task.estimatedSeconds));
    }
  };

  // Resolved to full objects here (the mutation only sends ids) so the checkbox/chip updates instantly, not after a refetch.
  const saveAssignees = (assigneeIds: string[]) => {
    const optimisticAssignees = members
      .filter((m) => assigneeIds.includes(m.userId))
      .map((m) => ({ userId: m.userId, name: m.name, image: m.image }));
    updateTask.mutate({ id: task.id, data: { assigneeIds }, optimisticAssignees });
  };

  // The only way an image reaches this task: pasted/dropped into the description or a
  // comment. The "Attachments" section below is a read-only gallery of what lands here.

  const toolbar = (
    <TaskDetailToolbar
      mode={mode}
      onModeChange={setMode}
      isSubtask={isSubtask}
      onDeleteTask={() => {
        onRequestDelete(task);
        // A subtask stays open behind the confirmation; confirming returns to its parent (TaskBoardList).
        if (!isSubtask) onClose();
      }}
    />
  );

  const parent = task.parentId ? allTasks.find((t) => t.id === task.parentId) : undefined;
  const title = (
    <div className="space-y-1">
      {parent && <TaskParentLink parent={parent} onOpen={(id) => navigate(taskPath(id))} />}
      <TaskTitle name={name} onNameChange={setName} onSave={saveName} members={members} />
    </div>
  );

  // Field rows first, then Description/Subtasks/Attachments as bigger blocks — the reference layout's order.
  const content = (
    <>
      <TaskProperties
        task={task}
        isSubtask={isSubtask}
        members={members}
        membersLoading={membersLoading}
        dueOpen={dueOpen}
        onDueOpenChange={setDueOpen}
        estimate={estimate}
        onEstimateChange={setEstimate}
        onSaveEstimate={saveEstimate}
        running={running}
        onToggleTimer={() =>
          running ? stopTimer() : startTimer({ description: task.name, projectId: task.projectId, taskId: task.id })
        }
        onChangeProject={(projectId) => updateTask.mutate({ id: task.id, data: { projectId } })}
        onChangeAssignees={saveAssignees}
        onChangeDueDate={(dueDate) => updateTask.mutate({ id: task.id, data: { dueDate } })}
        onChangePriority={(priority) => updateTask.mutate({ id: task.id, data: { priority } })}
      />

      {/* No heading: the text sits right under the fields, and the empty editor's own placeholder says what goes there. */}
      <div className="border-t pt-4">
        <TaskDescriptionField
          key={task.id}
          task={task}
          onSave={saveDescription}
          onUploadImage={uploadImage}
          onDeleteImage={deleteOrphanedImage}
          members={members}
        />
      </div>

      {!isSubtask && (
        <TaskSubtasks
          task={task}
          subtasks={subtasks}
          onToggle={completeTask}
          onOpen={(id) => navigate(taskPath(id))}
          onRequestDelete={onRequestDelete}
        />
      )}

      <TaskAttachments
        attachments={attachments}
        loading={attachmentsLoading}
        onOpenLightbox={setLightbox}
        onDelete={(id) => deleteAttachment.mutate({ taskId: task.id, id })}
        onUpload={uploadImage}
      />
    </>
  );

  const shell =
    mode === "sidebar" ? (
      <TaskSidebarShell
        open={open}
        onClose={onClose}
        taskName={task.name}
        tab={tab}
        onTabChange={onTabChange}
        commentsCount={commentsCount}
        toolbar={toolbar}
        title={title}
        content={content}
        comments={<TaskComments taskId={task.id} members={members} />}
      />
    ) : (
      <TaskModalShell
        open={open}
        onClose={onClose}
        taskName={task.name}
        focusComments={tab === "comments"}
        commentsCount={commentsCount}
        toolbar={toolbar}
        title={title}
        content={content}
        comments={<TaskComments taskId={task.id} members={members} docked={!narrow} />}
      />
    );

  return (
    <>
      {shell}

      <Dialog open={!!lightbox} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-w-3xl p-2">
          <DialogTitle className="sr-only">{lightbox?.filename}</DialogTitle>
          {lightbox && (
            <img
              src={lightbox.url}
              alt={lightbox.filename}
              className="max-h-(--size-cap-80vh) w-full rounded object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
