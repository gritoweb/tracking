import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { useUpdateEntry, useDeleteEntry, useCreateEntry } from "@/hooks/useEntries";
import { useProjects, useTagColors } from "@/hooks/useProjects";
import { usePushEntries, useIntegrations } from "@/hooks/useIntegrations";
import { useTimer } from "@/hooks/useTimer";
import { cn } from "@/lib/utils";
import { formatDurationShort, formatShortDate, formatEntryTime, localDayKey, parseTimeInput } from "@/lib/dateUtils";
import { toCreatePayload } from "@/lib/entryUtils";
import { useUIStore } from "@/stores/uiStore";
import { useSavedFlash } from "@/hooks/useSavedFlash";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { ColorDot } from "@/components/ColorDot";
import { EntryRowDescription } from "./EntryRowDescription";
import { EntryRowTiming } from "./EntryRowTiming";
import { EntryRowIndicators } from "./EntryRowIndicators";
import { EntryRowActions } from "./EntryRowActions";
import type { TimeEntry } from "@shared/schemas";

interface EntryRowProps {
  entry: TimeEntry;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

/** Must match `duration-base` on the row's exit animation below. */
const EXIT_MS = 200;

export function EntryRow({ entry, isSelected = false, onToggleSelect }: EntryRowProps) {
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState(entry.description);
  const [editingDuration, setEditingDuration] = useState(false);
  const [durationInput, setDurationInput] = useState("");
  const [durationInvalid, setDurationInvalid] = useState(false);
  const [removing, setRemoving] = useState(false);
  // Flushed if the row unmounts before its exit animation finishes — see handleDelete.
  const pendingDelete = useRef<(() => void) | null>(null);
  useEffect(() => () => pendingDelete.current?.(), []);
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const updateEntry = useUpdateEntry();
  const deleteEntry = useDeleteEntry();
  const createEntry = useCreateEntry();
  const pushEntries = usePushEntries();
  const { data: projects = [] } = useProjects();
  const tagColor = useTagColors();
  const { data: integrations = [] } = useIntegrations();
  const { startTimer } = useTimer();
  const timeFormat = useUIStore((s) => s.timeFormat);
  const highlighted = useUIStore((s) => s.highlightedEntryId === entry.id);
  // Inline commits acknowledge themselves; see useSavedFlash.
  const savedDesc = useSavedFlash();
  const savedDuration = useSavedFlash();
  const savedRange = useSavedFlash();
  const savedProject = useSavedFlash();
  // The editor is hosted by EntryList, not here — a row that unmounts (its day
  // changed, its group collapsed) must not take a half-finished edit with it.
  const openEntryEditor = useUIStore((s) => s.openEntryEditor);
  const flashEntry = useUIStore((s) => s.flashEntry);

  // Resync the draft description when it changes from outside — a WS edit from
  // another tab, or a failed mutation rolling back. Previously this was masked
  // by the row's key being derived from the description: any change remounted
  // the row and reset the state. Now that the key is stable, the resync has to
  // be explicit or a stale draft would be written back on the next blur.
  const [syncedDesc, setSyncedDesc] = useState(entry.description);
  if (syncedDesc !== entry.description) {
    setSyncedDesc(entry.description);
    // Never clobber what the user is actively typing.
    if (!editingDesc) setDesc(entry.description);
  }

  const project = projects.find((p) => p.id === entry.projectId);
  const integration = integrations.find((i) => i.id === project?.integrationId);
  const isCompleted = !!entry.stop && (entry.duration ?? 0) > 0;
  const isPushing =
    pushEntries.isPending && !!pushEntries.variables?.entryIds.includes(entry.id);

  const handlePush = () => {
    if (!integration || (!isCompleted && entry.syncStatus !== "error")) return;
    pushEntries.mutate({ entryIds: [entry.id] });
  };

  const pushTitle = isPushing
    ? "Pushing…"
    : entry.syncStatus === "synced"
      ? `Pushed to ${integration?.name ?? "integration"}${
          entry.syncedAt
            ? ` · ${formatShortDate(entry.syncedAt)} ${formatEntryTime(entry.syncedAt, timeFormat)}`
            : ""
        } — click to push again`
      : entry.syncStatus === "error"
        ? `${entry.syncError ?? "Push failed"} — click to retry`
        : isCompleted
          ? `Push to ${integration?.name ?? "integration"}`
          : "Finish the entry before pushing";

  const handleDescBlur = () => {
    setEditingDesc(false);
    if (desc !== entry.description) {
      updateEntry.mutate(
        { id: entry.id, data: { description: desc } },
        { onSuccess: savedDesc.flash }
      );
    }
  };

  const handleStartEditDuration = () => {
    // Seed with the same text the row was showing. It used to seed with
    // formatSeconds ("01:30:00") under a display of formatDurationShort
    // ("1h 30m"), so the value appeared to change the instant you clicked it.
    // parseTimeInput round-trips this form, so nothing is lost.
    setDurationInput(entry.duration ? formatDurationShort(entry.duration) : "");
    setDurationInvalid(false);
    setEditingDuration(true);
  };

  const handleSaveDuration = () => {
    const parsed = parseTimeInput(durationInput);
    // Unparseable or non-positive input used to close the field and silently
    // restore the old duration — the edit simply evaporated. Hold the field open
    // and mark it instead; on this screen a dropped duration is a wrong invoice.
    if (parsed === null || parsed <= 0 || !entry.start) {
      setDurationInvalid(true);
      return;
    }
    setDurationInvalid(false);
    setEditingDuration(false);
    const newStop = new Date(new Date(entry.start).getTime() + parsed * 1000).toISOString();
    updateEntry.mutate(
      { id: entry.id, data: { stop: newStop } },
      { onSuccess: savedDuration.flash }
    );
  };

  const cancelDurationEdit = () => {
    setDurationInvalid(false);
    setEditingDuration(false);
  };

  const handleRangeChange = ({ start, stop }: { start: string; stop: string | null }) => {
    // Changing the date moves the entry to another day group, so this row
    // unmounts on the optimistic patch and a tick rendered here would never be
    // seen. Flash the entry instead — the same machinery that shows you where a
    // stopped timer landed — and fire it now, before the row relocates, rather
    // than from an onSuccess this component won't be around to receive.
    const movedDay = localDayKey(start) !== localDayKey(entry.start);
    if (movedDay) flashEntry(entry.id);
    updateEntry.mutate(
      // `undefined` omits the field: a running entry keeps its null stop rather
      // than having it explicitly cleared.
      { id: entry.id, data: { start, stop: stop ?? undefined } },
      movedDay ? undefined : { onSuccess: savedRange.flash }
    );
  };

  const handleContinue = () => {
    startTimer({
      description: entry.description,
      projectId: entry.projectId,
      billable: entry.billable,
    });
  };

  /**
   * Let the exit animation play, then commit — but never let the animation be
   * what decides whether the delete happens.
   *
   * This used to fire from the row's `onAnimationEnd`, so the deletion only
   * happened if the animation was allowed to finish. Anything that unmounted the
   * row inside that 200 ms window — collapsing its group or day header, switching
   * Timer view, navigating the period — cancelled it silently: no delete, no
   * toast, no error, and the row reappeared on the next refetch.
   *
   * The commit is held in a ref and flushed on unmount, so the window is a
   * presentation delay rather than a condition.
   */
  const handleDelete = () => {
    if (removing) return;
    setRemoving(true);
    const payload = toCreatePayload(entry);
    pendingDelete.current = () => {
      pendingDelete.current = null;
      deleteEntry.mutate(entry.id);
      toast.success("Entry deleted", {
        action: payload
          ? { label: "Undo", onClick: () => createEntry.mutate(payload) }
          : undefined,
      });
    };
    setTimeout(() => pendingDelete.current?.(), reducedMotion ? 0 : EXIT_MS);
  };

  return (
    <div
      className={cn(
        "group flex items-center gap-3 border-b border-border-strong px-4 py-2.5 transition-colors duration-fast ease-out-quart hover:bg-accent/40",
        removing
          ? "pointer-events-none animate-out fade-out slide-out-to-right-4 fill-mode-forwards duration-base ease-out-quart"
          : highlighted
            ? "animate-stopped"
            : "animate-fade-up",
        isSelected && "bg-accent/60"
      )}
    >
      {/* Checkbox (visible on hover or when any selection active) */}
      {onToggleSelect && (
        <Checkbox
          checked={isSelected}
          onCheckedChange={() => onToggleSelect(entry.id)}
          aria-label="Select entry"
          className={cn(!isSelected && "tt-reveal")}
        />
      )}

      {/* Project color dot */}
      <ColorDot color={entry.projectColor} className="h-3 w-3" />

      <EntryRowDescription
        entry={entry}
        desc={desc}
        editingDesc={editingDesc}
        onDescChange={setDesc}
        onStartEdit={() => setEditingDesc(true)}
        onDescBlur={handleDescBlur}
        onDescKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDesc(entry.description);
            setEditingDesc(false);
          }
        }}
        descSaved={savedDesc.saved}
        timeFormat={timeFormat}
        onRangeChange={handleRangeChange}
        projectSaved={savedProject.saved}
        onAssignProject={(projectId) =>
          updateEntry.mutate(
            { id: entry.id, data: { projectId } },
            { onSuccess: savedProject.flash }
          )
        }
        tagColor={tagColor}
      />

      <EntryRowIndicators entry={entry} integration={integration} isPushing={isPushing} pushTitle={pushTitle} />

      <EntryRowTiming
        entry={entry}
        timeFormat={timeFormat}
        onRangeChange={handleRangeChange}
        rangeSaved={savedRange.saved}
        editingDuration={editingDuration}
        durationInput={durationInput}
        durationInvalid={durationInvalid}
        onDurationInputChange={(value) => {
          setDurationInput(value);
          if (durationInvalid) setDurationInvalid(false);
        }}
        onDurationBlur={handleSaveDuration}
        onDurationKeyDown={(e) => {
          if (e.key === "Enter") handleSaveDuration();
          if (e.key === "Escape") cancelDurationEdit();
        }}
        onStartEditDuration={handleStartEditDuration}
        durationSaved={savedDuration.saved}
      />

      <EntryRowActions
        entry={entry}
        integration={integration}
        isCompleted={isCompleted}
        isPushing={isPushing}
        onContinue={handleContinue}
        onEdit={() => openEntryEditor(entry.id)}
        onPush={handlePush}
        onDelete={handleDelete}
      />
    </div>
  );
}
