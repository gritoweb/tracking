import { taskPath, type TaskTab } from "@shared/task-links";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { TaskSheetHeader } from "./TaskSheetHeader";
import { TaskProperties } from "./TaskProperties";
import { TaskSubtasks } from "./TaskSubtasks";
import { TaskAttachments } from "./TaskAttachments";
import { TaskComments } from "./TaskComments";
import { useTaskComments } from "@/hooks/useTaskComments";
import { RichTextEditor } from "./RichTextEditor";
import {
  useAllTasks,
  useCompleteTask,
  useUpdateTask,
  useTaskAttachments,
  useUploadTaskAttachment,
  useDeleteTaskAttachment,
} from "@/hooks/useTasks";
import { useWorkspaceMembers } from "@/hooks/useWorkspaceRole";
import { useTimer } from "@/hooks/useTimer";
import { useTimerStore } from "@/stores/timerStore";
import { parseTimeInput, formatTimeInput } from "@/lib/dateUtils";
import { parseDescription, serializeDescription } from "@/lib/richText";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";
import type { Task, TaskAttachment } from "@shared/schemas";
import type { JSONContent } from "@tiptap/react";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
/** Past this, the description collapses behind a "Show more" — matching ClickUp's "Objetivo". */
const DESCRIPTION_COLLAPSED_HEIGHT = 180;

interface TaskSheetProps {
  open: boolean;
  onClose: () => void;
  task: Task | null;
  /** The active tab lives in the URL, so a copied link reopens on the same one. */
  tab: TaskTab;
  onTabChange: (tab: TaskTab) => void;
  onRequestDelete: (task: Task) => void;
}

/**
 * Full when short, collapsed with a "Show more" when it overflows — never a fixed scroll box.
 * Keyed by task id from the caller, so switching tasks remounts it and `expanded` starts fresh.
 */
function DescriptionField({
  task,
  onSave,
  onUploadImage,
  onDeleteImage,
  members,
}: {
  task: Task;
  members: WorkspaceMember[];
  onSave: (doc: JSONContent) => void;
  onUploadImage: (file: File) => Promise<{ url: string; id: string }>;
  onDeleteImage: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Wait for the content to actually paint before measuring it.
    const id = requestAnimationFrame(() => {
      const el = contentRef.current;
      if (el) setOverflowing(el.scrollHeight > DESCRIPTION_COLLAPSED_HEIGHT + 1);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div>
      <div
        ref={contentRef}
        className="overflow-hidden"
        style={!expanded && overflowing ? { maxHeight: DESCRIPTION_COLLAPSED_HEIGHT } : undefined}
      >
        <RichTextEditor
          aria-label="Description"
          content={parseDescription(task.description)}
          onBlur={onSave}
          onUploadImage={onUploadImage}
          onDeleteImage={onDeleteImage}
          members={members}
          placeholder="Context, links, acceptance criteria — anything that isn't the name."
        />
      </div>
      {overflowing && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 text-muted-foreground"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "Show less" : "Show more"}
        </Button>
      )}
    </div>
  );
}

/**
 * A task's detail panel — the D5 replacement for opening `TaskDialog` on an
 * existing task. Every field autosaves on change/blur, the same pattern
 * `TaskRow`'s inline edits already use, rather than a batched Save button:
 * this panel is meant to stay open while the task keeps moving.
 *
 * Controller: owns hooks/mutations/state; TaskSheetHeader/Properties/Subtasks/Attachments are pure views.
 */
export function TaskSheet({ open, onClose, task, tab, onTabChange, onRequestDelete }: TaskSheetProps) {
  const navigate = useNavigate();
  const updateTask = useUpdateTask();
  const completeTask = useCompleteTask();
  const { data: members = [], isPending: membersLoading } = useWorkspaceMembers(open);
  const { data: allTasks = [] } = useAllTasks();
  const { data: attachments = [], isLoading: attachmentsLoading } = useTaskAttachments(task?.id ?? null);
  const { data: comments = [] } = useTaskComments(task?.id ?? null);
  const uploadAttachment = useUploadTaskAttachment();
  const deleteAttachment = useDeleteTaskAttachment();
  const { startTimer, stopTimer } = useTimer();
  const runningEntry = useTimerStore((s) => s.runningEntry);

  const [name, setName] = useState("");
  const [estimate, setEstimate] = useState("");
  const [dueOpen, setDueOpen] = useState(false);
  const [lightbox, setLightbox] = useState<TaskAttachment | null>(null);

  const syncedId = useRef<string | null>(null);
  useEffect(() => {
    if (!task || task.id === syncedId.current) return;
    syncedId.current = task.id;
    setName(task.name);
    setEstimate(formatTimeInput(task.estimatedSeconds));
  }, [task]);

  if (!task) return null;

  const isSubtask = Boolean(task.parentId);
  const subtasks = allTasks.filter((t) => t.parentId === task.id);
  const running = runningEntry?.taskId === task.id;

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
  const uploadImage = async (file: File): Promise<{ url: string; id: string }> => {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast.error("Only PNG, JPEG, WebP and GIF images are accepted");
      throw new Error("unsupported type");
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast.error("Image is larger than 10 MB");
      throw new Error("too large");
    }
    const attachment = await uploadAttachment.mutateAsync({ taskId: task.id, file });
    return { url: attachment.url, id: attachment.id };
  };

  // Only fires when an upload's insertion spot vanished mid-flight, leaving an orphan in R2 (RichTextEditor).
  const deleteOrphanedImage = (id: string) => deleteAttachment.mutate({ taskId: task.id, id });

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="flex w-full flex-col gap-0 rounded-l-none p-0 sm:max-w-xl sm:rounded-l-container">
          <Tabs value={tab} onValueChange={(v) => onTabChange(v as TaskTab)} className="min-h-0 flex-1">
            <TaskSheetHeader
              task={task}
              name={name}
              onNameChange={setName}
              onSaveName={saveName}
              commentsCount={comments.length}
              members={members}
              onDeleteTask={() => {
                onRequestDelete(task);
                onClose();
              }}
            />

            <TabsContent value="task" className="min-h-0 space-y-5 overflow-y-auto px-6 py-5">
              {/* Field rows first, icon+label left / value right — the ClickUp reference's own
                  order, not its full field set. Description/Subtasks/Attachments follow as
                  their own bigger blocks, same as "Objetivo" comes after the field rows there. */}
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
                  running
                    ? stopTimer()
                    : startTimer({ description: task.name, projectId: task.projectId, taskId: task.id })
                }
                onChangeProject={(projectId) => updateTask.mutate({ id: task.id, data: { projectId } })}
                onChangeAssignees={saveAssignees}
                onChangeDueDate={(dueDate) => updateTask.mutate({ id: task.id, data: { dueDate } })}
                onChangePriority={(priority) => updateTask.mutate({ id: task.id, data: { priority } })}
              />

              <div className="space-y-1.5 border-t pt-4">
                <Label className="text-base font-semibold">Description</Label>
                <DescriptionField
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
              />
            </TabsContent>

            <TabsContent value="comments" className="min-h-0 overflow-y-auto px-6 py-5">
              <TaskComments taskId={task.id} members={members} />
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

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
