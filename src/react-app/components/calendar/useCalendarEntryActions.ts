import { toast } from "sonner";
import type { EventDropArg } from "@fullcalendar/core";
import type { EventResizeDoneArg, DropArg } from "@fullcalendar/interaction";
import { useCreateEntry, useUpdateEntry, useDeleteEntry } from "@/hooks/useEntries";
import { toastApiError } from "@/lib/toastApiError";
import { formatEntryTime } from "@/lib/dateUtils";
import type { EditableEntry } from "@/components/forms/EntryForm";

/** Drag/resize/drop/duplicate/delete handlers for real calendar entries — the mutation half of CalendarBody. */
export function useCalendarEntryActions(timeFormat: "24h" | "12h") {
  const updateEntry = useUpdateEntry();
  const createEntry = useCreateEntry();
  const deleteEntry = useDeleteEntry();

  const handleMoveOrResize = (arg: EventDropArg | EventResizeDoneArg) => {
    const { start, end } = arg.event;
    if (!start || !end) {
      arg.revert();
      return;
    }
    updateEntry.mutate(
      { id: arg.event.id, data: { start: start.toISOString(), stop: end.toISOString() } },
      {
        onError: (error) => {
          arg.revert();
          toastApiError(error, "Couldn't update entry");
        },
      }
    );
  };

  /**
   * A task dropped on the grid becomes a completed entry at that slot.
   *
   * Written immediately, with an Undo toast — no confirm dialog. A gesture whose
   * whole value is "one motion, done" cannot end in a form; the confirmation is
   * that you can see where it landed, and take it back.
   *
   * Length is the task's estimate, falling back to the grid's own slot (30m) so
   * the block matches the space the pointer was over. Month view has no time of
   * day to drop onto, so it isn't a target.
   */
  const handleTaskDrop = (arg: DropArg) => {
    const el = arg.draggedEl;
    const taskId = el.getAttribute("data-task-id");
    const projectId = el.getAttribute("data-project-id");
    const name = el.getAttribute("data-task-name") ?? "";
    if (!taskId || !projectId) return;

    const estimate = Number(el.getAttribute("data-estimate")) || 30 * 60;
    const start = arg.date;
    const stop = new Date(start.getTime() + estimate * 1000);

    createEntry.mutate(
      {
        description: name,
        projectId,
        taskId,
        start: start.toISOString(),
        stop: stop.toISOString(),
        tags: [],
      },
      {
        onSuccess: (entry) => {
          toast.success(`Logged ${name}`, {
            description: `${formatEntryTime(entry.start, timeFormat)} – ${formatEntryTime(
              entry.stop!,
              timeFormat
            )}`,
            action: { label: "Undo", onClick: () => deleteEntry.mutate(entry.id) },
          });
        },
        onError: (error) => toastApiError(error, "Couldn't log that task"),
      }
    );
  };

  const handleDuplicate = (entry: EditableEntry) => {
    // Every entry needs a project (D3); an older entry without one has to get one first.
    if (!entry.projectId) {
      toast.error("Give this entry a project before duplicating it");
      return;
    }
    const projectId = entry.projectId;
    createEntry.mutate(
      {
        description: entry.description,
        projectId,
        taskId: entry.taskId,
        tags: entry.tags,
        billable: entry.billable,
        start: entry.start,
        stop: entry.stop,
      },
      { onError: (error) => toastApiError(error, "Couldn't duplicate entry") }
    );
  };

  const handleDeleteEntry = (entry: EditableEntry) => {
    deleteEntry.mutate(entry.id, {
      onError: (error) => toastApiError(error, "Couldn't delete entry"),
    });
  };

  return { handleMoveOrResize, handleTaskDrop, handleDuplicate, handleDeleteEntry };
}
