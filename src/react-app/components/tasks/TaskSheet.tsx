import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  CalendarDays,
  Check,
  CircleDot,
  ClipboardList,
  Flag,
  FolderOpen,
  Hourglass,
  ListPlus,
  MessageCircle,
  MoreHorizontal,
  Paperclip,
  Play,
  Square,
  Timer as TimerIcon,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectPicker } from "@/components/entries/ProjectPicker";
import { MultiSelect } from "@/components/reports/MultiSelect";
import { UserAvatar } from "@/components/layout/UserAvatar";
import { ColorDot } from "@/components/ColorDot";
import { Skeleton } from "@/components/ui/skeleton";
import { QuickAddTask } from "./QuickAddTask";
import { TaskComments } from "./TaskComments";
import { TaskStatusChip } from "./TaskStatusChip";
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
import { formatDurationShort, parseTimeInput, formatTimeInput } from "@/lib/dateUtils";
import {
  PRIORITIES,
  PRIORITY_LABEL,
  PRIORITY_RING,
  dateToLocalDate,
  formatDueDate,
  localDateToDate,
} from "@/lib/taskUtils";
import { parseDescription, serializeDescription } from "@/lib/richText";
import { cn } from "@/lib/utils";
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
  onRequestDelete: (task: Task) => void;
}

/** One row per field — icon+label on the left, value on the right, the ClickUp reference's own layout. */
function FieldRow({ icon, label, htmlFor, children }: { icon: ReactNode; label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <Label htmlFor={htmlFor} className="w-32 shrink-0 font-normal text-muted-foreground">
        {icon}
        {label}
      </Label>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
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
}: {
  task: Task;
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

function AttachmentThumb({ attachment, onOpen, onDelete }: { attachment: TaskAttachment; onOpen: () => void; onDelete: () => void }) {
  return (
    <div className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-md border bg-muted">
      <button type="button" onClick={onOpen} className="h-full w-full" aria-label={`Open ${attachment.filename}`}>
        <img src={attachment.url} alt={attachment.filename} className="h-full w-full object-cover" />
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${attachment.filename}`}
        className="absolute right-1 top-1 hidden rounded-full bg-background/90 p-0.5 text-muted-foreground group-hover:block hover:text-destructive"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}

/**
 * A task's detail panel — the D5 replacement for opening `TaskDialog` on an
 * existing task. Every field autosaves on change/blur, the same pattern
 * `TaskRow`'s inline edits already use, rather than a batched Save button:
 * this panel is meant to stay open while the task keeps moving.
 */
export function TaskSheet({ open, onClose, task, onRequestDelete }: TaskSheetProps) {
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
  const [tab, setTab] = useState("task");
  const [dueOpen, setDueOpen] = useState(false);
  const [lightbox, setLightbox] = useState<TaskAttachment | null>(null);

  const syncedId = useRef<string | null>(null);
  useEffect(() => {
    if (!task || task.id === syncedId.current) return;
    syncedId.current = task.id;
    setName(task.name);
    setEstimate(formatTimeInput(task.estimatedSeconds));
    setTab("task");
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
        <SheetContent className="flex w-full flex-col gap-0 rounded-l-none p-0 sm:max-w-lg sm:rounded-l-container">
          {/* The border is what separates this chrome strip from the tabs below it. Actions on
              the left, matching EntryFormSheet's built-in top-right close — "..." rather than a
              bare trash icon, so delete isn't a stray misclick. */}
          <div className="flex h-12 shrink-0 items-center border-b px-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Task actions"
                  title="Task actions"
                  className="text-muted-foreground"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => {
                    onRequestDelete(task);
                    onClose();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete task
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1">
            {/* A thin underline, not a filled pill — this is a secondary switch, not the header. */}
            <TabsList variant="line" className="mx-6 mt-2 h-auto self-start p-0">
              <TabsTrigger value="task" className="gap-1.5 px-2 py-1.5">
                <ClipboardList className="h-3.5 w-3.5" />
                Task
              </TabsTrigger>
              <TabsTrigger value="comments" className="gap-1.5 px-2 py-1.5">
                <MessageCircle className="h-3.5 w-3.5" />
                Comments
                {comments.length > 0 && (
                  <span className="tabular-nums text-muted-foreground">{comments.length}</span>
                )}
              </TabsTrigger>
            </TabsList>

            {/* The name, right below the tab switcher rather than above it — visible on
                both tabs, since "whose comments am I reading" matters there too. */}
            <SheetHeader className="px-6 pb-2 pt-3">
              <SheetTitle className="sr-only">{task.name}</SheetTitle>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                className="h-auto border-none px-0 text-display font-semibold shadow-none focus-visible:ring-0"
                aria-label="Task name"
              />
            </SheetHeader>

          <TabsContent value="task" className="min-h-0 space-y-5 overflow-y-auto px-6 py-5">
            {/* Field rows first, icon+label left / value right — the ClickUp reference's own
                order, not its full field set. Description/Subtasks/Attachments follow as
                their own bigger blocks, same as "Objetivo" comes after the field rows there. */}
            <div>
              {!isSubtask && (
                <FieldRow icon={<FolderOpen className="h-3.5 w-3.5" />} label="Project">
                  {/* Same lean button molecule as every other field row's trigger — the
                      picker's own search-and-create panel (Popover + Command) is unchanged,
                      only its default `Button` trigger (fixed height, press-scale, its own
                      chrome) is swapped for one that actually matches its neighbours. */}
                  <ProjectPicker
                    value={task.projectId}
                    onChange={(projectId) => projectId && updateTask.mutate({ id: task.id, data: { projectId } })}
                  >
                    <button
                      type="button"
                      aria-label={task.projectName ? `Project: ${task.projectName}` : "Select project"}
                      className="flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm transition-colors duration-fast ease-out-quart hover:bg-accent"
                    >
                      {task.projectName ? (
                        <>
                          <ColorDot color={task.projectColor} />
                          <span className="min-w-0 max-w-30 truncate">{task.projectName}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Select project</span>
                      )}
                    </button>
                  </ProjectPicker>
                </FieldRow>
              )}

              <FieldRow icon={<CircleDot className="h-3.5 w-3.5" />} label="Status">
                {/* The list/board keep the pill (`tt-swatch-tint` is already the base class,
                    `rounded` here just overrides its `rounded-full` to match every other
                    field row on this panel — no pill shape isolated in the middle of plain ones). */}
                <TaskStatusChip task={task} className="rounded-md px-1.5 py-1" />
              </FieldRow>

              <FieldRow icon={<Users className="h-3.5 w-3.5" />} label="Assignees">
                <MultiSelect
                  label="Assignees"
                  closeOnSelect
                  options={members.map((m) => ({ value: m.userId, label: m.name, image: m.image }))}
                  value={task.assignees.map((a) => a.userId)}
                  onChange={saveAssignees}
                  loading={membersLoading}
                  trigger={
                    <button
                      type="button"
                      aria-label={task.assignees.length ? "Edit assignees" : "Add assignee"}
                      className="flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-sm transition-colors duration-fast ease-out-quart hover:bg-accent"
                    >
                      {task.assignees.length > 0 ? (
                        <>
                          <div className="flex shrink-0 -space-x-1.5">
                            {task.assignees.slice(0, 3).map((a) => (
                              <UserAvatar
                                key={a.userId}
                                name={a.name}
                                image={a.image}
                                className="h-5 w-5 border-2 border-background text-micro"
                              />
                            ))}
                          </div>
                          <span className="min-w-0 flex-1 truncate">
                            {task.assignees.map((a) => a.name).join(", ")}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Add assignee</span>
                      )}
                    </button>
                  }
                />
              </FieldRow>

              <FieldRow icon={<CalendarDays className="h-3.5 w-3.5" />} label="Due date">
                <Popover open={dueOpen} onOpenChange={setDueOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      aria-label={task.dueDate ? `Due ${formatDueDate(task.dueDate)} — change` : "Set due date"}
                      className={cn(
                        "flex max-w-full items-center rounded-md px-1.5 py-1 text-sm transition-colors duration-fast ease-out-quart hover:bg-accent",
                        !task.dueDate && "text-muted-foreground"
                      )}
                    >
                      {task.dueDate ? formatDueDate(task.dueDate) : "Set due date"}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={task.dueDate ? localDateToDate(task.dueDate) : undefined}
                      onSelect={(d) => {
                        updateTask.mutate({ id: task.id, data: { dueDate: d ? dateToLocalDate(d) : null } });
                        setDueOpen(false);
                      }}
                    />
                    {task.dueDate && (
                      <div className="border-t p-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start"
                          onClick={() => {
                            updateTask.mutate({ id: task.id, data: { dueDate: null } });
                            setDueOpen(false);
                          }}
                        >
                          Clear due date
                        </Button>
                      </div>
                    )}
                  </PopoverContent>
                </Popover>
              </FieldRow>

              <FieldRow icon={<Flag className="h-3.5 w-3.5" />} label="Priority">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={`Priority: ${PRIORITY_LABEL[task.priority]} — change`}
                      className="flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-sm transition-colors duration-fast ease-out-quart hover:bg-accent"
                    >
                      <span className={cn("h-2 w-2 shrink-0 rounded-full border-2", PRIORITY_RING[task.priority])} />
                      {PRIORITY_LABEL[task.priority]}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuRadioGroup
                      value={String(task.priority)}
                      onValueChange={(v) => updateTask.mutate({ id: task.id, data: { priority: Number(v) } })}
                    >
                      {PRIORITIES.map((p) => (
                        <DropdownMenuRadioItem key={p} value={String(p)}>
                          {PRIORITY_LABEL[p]}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </FieldRow>

              <FieldRow icon={<Hourglass className="h-3.5 w-3.5" />} label="Estimate" htmlFor="task-sheet-estimate">
                <Input
                  id="task-sheet-estimate"
                  value={estimate}
                  onChange={(e) => setEstimate(e.target.value)}
                  onBlur={saveEstimate}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                  placeholder="e.g. 1h 30m"
                  className="h-auto w-32 rounded-md border-transparent bg-transparent px-1.5 py-1 hover:bg-accent focus-visible:border-transparent focus-visible:ring-0"
                />
              </FieldRow>

              <FieldRow icon={<TimerIcon className="h-3.5 w-3.5" />} label="Time tracked">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm tabular-nums">{formatDurationShort(task.trackedSeconds)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={running ? "Stop timer" : "Start timer on this task"}
                    onClick={() =>
                      running
                        ? stopTimer()
                        : startTimer({ description: task.name, projectId: task.projectId, taskId: task.id })
                    }
                    className={running ? "text-primary" : "text-muted-foreground hover:text-primary"}
                  >
                    {running ? <Square className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </FieldRow>
            </div>

            <div className="space-y-1.5 border-t pt-4">
              <Label className="text-base font-semibold">Description</Label>
              <DescriptionField
                key={task.id}
                task={task}
                onSave={saveDescription}
                onUploadImage={uploadImage}
                onDeleteImage={deleteOrphanedImage}
              />
            </div>

            {!isSubtask && (
              <div className="space-y-1.5">
                <Label className="text-base font-semibold">
                  <ListPlus className="h-4 w-4" />
                  Subtasks{task.subtaskTotal ? ` (${task.subtaskDone}/${task.subtaskTotal})` : ""}
                </Label>
                {/* No enclosing box — a border around the list plus the quick-add's own
                    dashed border was a box inside a box. Rows divide with a hairline;
                    the quick-add stands on its own underneath. */}
                <div className="space-y-1">
                  {subtasks.map((sub) => (
                    <div key={sub.id} className="group/subtask flex items-center gap-2 border-b px-1 py-1.5 last:border-b-0">
                      <button
                        onClick={() => completeTask(sub, sub.active)}
                        aria-label={sub.active ? "Mark subtask done" : "Mark subtask not done"}
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                          !sub.active && "border-primary bg-primary"
                        )}
                      >
                        {!sub.active && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                      </button>
                      {/* Opens the subtask in its own sheet — same panel, same edit/assignee/delete
                          it would get as a top-level task, not a second stripped-down view of it. */}
                      <button
                        onClick={() => navigate(`/tasks/${sub.id}`)}
                        className={cn(
                          "min-w-0 flex-1 truncate rounded text-left text-sm hover:underline",
                          !sub.active && "text-muted-foreground line-through"
                        )}
                      >
                        {sub.name}
                      </button>
                      {sub.assignees.length > 0 && (
                        <div className="flex shrink-0 -space-x-1.5">
                          {sub.assignees.slice(0, 3).map((a) => (
                            <UserAvatar
                              key={a.userId}
                              name={a.name}
                              image={a.image}
                              className="h-5 w-5 border-2 border-background text-micro"
                            />
                          ))}
                        </div>
                      )}
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Delete ${sub.name}`}
                        onClick={() => onRequestDelete(sub)}
                        className="tt-reveal shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  <QuickAddTask parentId={task.id} defaultProjectId={task.projectId} placeholder="Add a subtask" bare />
                </div>
              </div>
            )}

            {/* Read-only gallery — nothing is ever uploaded here. Everything sent through the
                description or a comment lands in this task's own attachments, and shows up here
                as a convenience, last on the panel, same as the ClickUp reference's own Anexos. */}
            <div className="space-y-1.5">
              <Label className="text-base font-semibold">Attachments</Label>
              {attachmentsLoading ? (
                <Skeleton className="h-20 w-20" />
              ) : attachments.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {attachments.map((a) => (
                    <AttachmentThumb
                      key={a.id}
                      attachment={a}
                      onOpen={() => setLightbox(a)}
                      onDelete={() => deleteAttachment.mutate({ taskId: task.id, id: a.id })}
                    />
                  ))}
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-micro text-muted-foreground">
                  <Paperclip className="h-3 w-3" />
                  Sent through the description or a comment — nothing to show yet.
                </p>
              )}
            </div>
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
          {lightbox && <img src={lightbox.url} alt={lightbox.filename} className="max-h-[80vh] w-full rounded object-contain" />}
        </DialogContent>
      </Dialog>
    </>
  );
}
