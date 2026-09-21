import { useState, useRef, useEffect } from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { toastApiError } from "@/lib/toastApiError";
import { Input } from "@/components/ui/input";
import { TimerBarTagList } from "./TimerBarTagList";
import { TimerBarProjectTask } from "./TimerBarProjectTask";
import { TimerBarControls } from "./TimerBarControls";
import { useTimerStore } from "@/stores/timerStore";
import { useUIStore } from "@/stores/uiStore";
import { useTimer, useTimerLifecycle, type StartTimerInput } from "@/hooks/useTimer";
import { useUpdateEntry } from "@/hooks/useEntries";
import { useTagColors } from "@/hooks/useProjects";
import { BillableToggle } from "@/components/pickers/BillableToggle";
import { DEFAULT_ENTRY_BILLABLE } from "@shared/billable";
import { cn } from "@/lib/utils";

export function TimerBar() {
  const { runningEntry } = useTimerStore();
  const { startTimer, stopTimer, discardTimer } = useTimer();
  const updateEntry = useUpdateEntry();
  // Shared with the Alt+Shift+X hotkey (registered in useTimerLifecycle) so
  // both the trash-icon button and the keyboard shortcut open the same
  // confirm dialog.
  const confirmDiscard = useUIStore((s) => s.discardConfirmOpen);
  const setConfirmDiscard = useUIStore((s) => s.setDiscardConfirmOpen);

  const [description, setDescription] = useState("");
  // Opens on the last project used: a bar that forgets it asks for one on every start.
  const [projectId, setProjectId] = useState<string | null>(
    () => useUIStore.getState().lastProjectId
  );
  const [taskId, setTaskId] = useState<string | null>(null);
  // Tags carried over from a picked suggestion (or synced from the running
  // entry). The bar has no tag *picker* — chips are removable but only ever
  // added via suggestions/favorites; full editing lives in the entry sheet.
  const [tags, setTags] = useState<string[]>([]);
  // Every entry is born billable; only the user's own toggle turns it off.
  const [billable, setBillable] = useState(DEFAULT_ENTRY_BILLABLE);
  const tagColor = useTagColors();
  const descRef = useRef<HTMLInputElement>(null);

  // A start without a project (the button, Alt+Shift+S, a favourite, a nudge) waits here until one is picked (D3).
  const pendingStart = useUIStore((s) => s.pendingStart);
  const setPendingStart = useUIStore((s) => s.setPendingStart);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const [seenPendingStart, setSeenPendingStart] = useState(pendingStart);
  if (seenPendingStart !== pendingStart) {
    setSeenPendingStart(pendingStart);
    if (pendingStart && !runningEntry) {
      if (pendingStart.description !== undefined) setDescription(pendingStart.description);
      if (pendingStart.tags) setTags(pendingStart.tags);
      if (pendingStart.billable !== undefined) setBillable(pendingStart.billable);
    }
  }

  const isRunning = Boolean(runningEntry);

  // Sync the editable fields from the running entry whenever it changes
  // (restored from IndexedDB, or started/stopped in another tab). Adjusting
  // during render avoids a frame of stale fields. The task is cleared on user
  // project changes by the ProjectPicker handler below, so restoring the
  // entry's own task here is safe and correct.
  const [syncedEntryId, setSyncedEntryId] = useState<string | null>(
    runningEntry?.id ?? null
  );
  const [syncedProjectId, setSyncedProjectId] = useState<string | null>(
    runningEntry?.projectId ?? null
  );
  const [syncedTaskId, setSyncedTaskId] = useState<string | null>(
    runningEntry?.taskId ?? null
  );
  const tagsKey = (runningEntry?.tags ?? []).join("\0");
  const [syncedTagsKey, setSyncedTagsKey] = useState(tagsKey);
  const [syncedBillable, setSyncedBillable] = useState(
    runningEntry?.billable ?? DEFAULT_ENTRY_BILLABLE
  );
  if (syncedEntryId !== (runningEntry?.id ?? null)) {
    setSyncedEntryId(runningEntry?.id ?? null);
    setSyncedProjectId(runningEntry?.projectId ?? null);
    setSyncedTaskId(runningEntry?.taskId ?? null);
    setSyncedTagsKey(tagsKey);
    setDescription(runningEntry?.description ?? "");
    setProjectId(runningEntry?.projectId ?? useUIStore.getState().lastProjectId);
    setTaskId(runningEntry?.taskId ?? null);
    setTags(runningEntry?.tags ?? []);
    // On stop (runningEntry → null) the bar resets to billable — every entry is born billable.
    setBillable(runningEntry?.billable ?? DEFAULT_ENTRY_BILLABLE);
  } else if (runningEntry) {
    // Same entry, but its project/task may have been reassigned elsewhere
    // (e.g. from the entries list). Keep the bar's pickers in sync. Description
    // is intentionally not re-synced here to avoid clobbering in-progress typing
    // while the debounced save is in flight.
    if (syncedProjectId !== (runningEntry.projectId ?? null)) {
      setSyncedProjectId(runningEntry.projectId ?? null);
      setProjectId(runningEntry.projectId ?? null);
    }
    if (syncedTaskId !== (runningEntry.taskId ?? null)) {
      setSyncedTaskId(runningEntry.taskId ?? null);
      setTaskId(runningEntry.taskId ?? null);
    }
    if (syncedTagsKey !== tagsKey) {
      setSyncedTagsKey(tagsKey);
      setTags(runningEntry.tags ?? []);
    }
    if (syncedBillable !== runningEntry.billable) {
      setSyncedBillable(runningEntry.billable);
      setBillable(runningEntry.billable);
    }
  }

  // Read at fire time, not closed over, so the debounce effect's deps can stay id-only.
  const runningEntryRef = useRef(runningEntry);
  const updateEntryRef = useRef(updateEntry);
  useEffect(() => {
    runningEntryRef.current = runningEntry;
    updateEntryRef.current = updateEntry;
  });

  // Debounced description update while running. A rejected save used to be
  // completely silent — the bar kept showing text the server never stored, and
  // the user found out when the stopped entry turned up blank.
  useEffect(() => {
    const entry = runningEntryRef.current;
    if (!entry || description === entry.description) return;
    const t = setTimeout(() => {
      updateEntryRef.current.mutate(
        { id: entry.id, data: { description } },
        {
          onError: (error) =>
            toastApiError(error, "Couldn't save the description — it hasn't been stored on this entry yet."),
        }
      );
    }, 800);
    return () => clearTimeout(t);
  }, [description, runningEntry?.id]);

  // The single definition of "what the bar would start", handed to both the
  // button below and the Alt+Shift+S hotkey inside `useTimerLifecycle`. That
  // hotkey used to call `startTimer()` with no arguments at all — starting a
  // blank, project-less, non-billable entry, whose sync then wiped the staged
  // description and project off the screen. The button and the shortcut it
  // advertises now start the same entry.
  const draft: StartTimerInput = { description, projectId, taskId, tags, billable };

  // Owns the tick loop, mount-restore, and Alt+Shift+S/X hotkeys — must be
  // called exactly once (TimerBar is always mounted), not from every component
  // that just needs the action functions above. Takes the draft so the start
  // shortcut commits what's on screen rather than an empty entry.
  useTimerLifecycle(draft);

  const handleStart = () => startTimer(draft);
  const handleStop = () => stopTimer();
  const handleSubmit = () => {
    if (isRunning) handleStop();
    else handleStart();
  };

  // Picking a suggestion restores the whole combo it was usually logged against,
  // not just the text — mirroring FavoritesMenu. While a timer is running the
  // project/task have to be pushed to the server too, exactly as the pickers
  // below do; the description rides along on the existing debounced save.

  // Chips are explicit state, removable one by one; typing a different
  // description deliberately does NOT clear them (the bar fully resets on
  // stop/discard anyway). PUT replaces the entry's whole tag set, so send the
  // filtered list.
  const removeTag = (name: string) => {
    const previous = tags;
    const next = tags.filter((t) => t !== name);
    setTags(next);
    if (runningEntry) {
      updateEntry.mutate(
        { id: runningEntry.id, data: { tags: next } },
        {
          // Without this the chip vanished from the bar while the tag stayed on
          // the entry — the bar and the server silently disagreeing about what
          // is being tracked, with nothing on screen to say so.
          onError: (error) => {
            setTags(previous);
            toastApiError(error, `Couldn't remove the tag "${name}" — it's still on this entry.`);
          },
        }
      );
    }
  };

  return (
    // Wrap is load-bearing, not a fallback. `md:flex-nowrap` used to switch this
    // row to nowrap while every control except the description was `shrink-0`
    // (Button's base class), so between 768px and ~1000px the row needed 680px
    // in a 544–676px container: the Stop button rendered past the viewport's
    // right edge with `scrollWidth === clientWidth`, i.e. clipped, not
    // scrollable. A running timer could not be stopped from the bar on an iPad
    // in portrait or a laptop at half width. Single row is now `xl` only, where
    // the numbers actually fit, and the controls are one shrink-0 unit that
    // wraps whole rather than being pushed off.
    <header aria-label="Timer controls" className="flex flex-wrap items-center gap-2 bg-card px-4 py-2 xl:h-14 xl:flex-nowrap xl:gap-3 xl:py-0">
      {/* Plain description field: free text, no suggestions dropdown. */}
      <Input
        variant="bare"
        ref={descRef}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          e.preventDefault();
          handleSubmit();
        }}
        placeholder="What are you working on?"
        className={cn(
          // Inset + full opacity: border-0 leaves this ring as the input's only focus signal (WCAG 2.4.7).
          // min-w-0 lets flex-1 yield at xl; without it the overflow pushes the rightmost control off-screen.
          // eslint-disable-next-line no-restricted-syntax -- an inset ring: the house ring would draw outside this borderless field
          "tt-touch basis-full text-sm placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-inset xl:min-w-0 xl:flex-1 xl:basis-auto",
          isRunning && "font-medium"
        )}
      />

      <TimerBarTagList tags={tags} tagColor={tagColor} onRemove={removeTag} />

      <TimerBarProjectTask
        projectId={projectId}
        taskId={taskId}
        isRunning={isRunning}
        projectPickerOpen={projectPickerOpen}
        holdOpen={Boolean(pendingStart)}
        onProjectPickerOpenChange={(open) => {
          setProjectPickerOpen(open);
          if (!open) setPendingStart(null);
        }}
        onProjectChange={(id) => {
          setProjectId(id);
          useUIStore.getState().setLastProjectId(id);
          setTaskId(null);
          // Billable is its own toggle now — the project no longer sets it.
          if (runningEntry) {
            updateEntry.mutate({
              id: runningEntry.id,
              data: { projectId: id, taskId: null },
            });
          } else if (pendingStart) {
            startTimer({
              description: pendingStart.description ?? description,
              tags: pendingStart.tags ?? tags,
              billable: pendingStart.billable ?? billable,
              projectId: id,
              taskId: null,
            });
            setPendingStart(null);
          }
        }}
        onClearProject={() => {
          setProjectId(null);
          setTaskId(null);
          useUIStore.getState().setLastProjectId(null);
        }}
        onTaskChange={(id) => {
          setTaskId(id);
          if (runningEntry) {
            updateEntry.mutate({ id: runningEntry.id, data: { taskId: id } });
          }
        }}
      />

      {/* Billable toggle. Last in the draft sequence — description, then what
          it's against, then whether it's invoiceable — and using the same bare
          `$` glyph and --primary-ink the entry row uses for its billable
          indicator, so the two surfaces read as one vocabulary. */}
      <BillableToggle
        value={billable}
        onChange={(next) => {
          setBillable(next);
          if (runningEntry) {
            updateEntry.mutate({ id: runningEntry.id, data: { billable: next } });
          }
        }}
      />

      <TimerBarControls
        isRunning={isRunning}
        onDiscard={() => setConfirmDiscard(true)}
        onResume={(s) =>
          startTimer({
            description: s.description,
            projectId: s.projectId,
            taskId: s.taskId,
            tags: s.tags,
            billable: s.billable,
          })
        }
        favoritesCurrent={{ description, projectId, taskId, tags, billable }}
        onStart={handleStart}
        onStop={handleStop}
        startDisabled={!projectId}
      />

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard running timer?"
        description="The time tracked so far will be permanently deleted. This cannot be undone."
        confirmLabel="Discard"
        onConfirm={discardTimer}
      />
    </header>
  );
}
