import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Field, FieldLabel, FieldMessage } from "@/components/forms/Field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ProjectPicker } from "@/components/pickers/ProjectPicker";
import { TaskPicker } from "@/components/pickers/TaskPicker";
import { TagPicker } from "@/components/pickers/TagPicker";
import { cn } from "@/lib/utils";
import { useCreateRecurring, useUpdateRecurring } from "@/hooks/useRecurring";
import {
  localScheduleToUtc,
  utcScheduleToLocal,
  minutesToHHMM,
  hhmmToMinutes,
  dayLabel,
} from "@/lib/recurrence";
import { DEFAULT_ENTRY_BILLABLE } from "@shared/billable";
import { recurringFormSchema, type RecurringFormValues } from "./RecurringEntryDialog.schema";
import type { RecurringEntry } from "@shared/schemas";
import { SettingsHint } from "./SettingsHint";

interface RecurringEntryDialogProps {
  open: boolean;
  onClose: () => void;
  editing?: RecurringEntry | null;
}

// Local weekday order shown Mon → Sun (indices 1..6,0).
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

export function RecurringEntryDialog({ open, onClose, editing }: RecurringEntryDialogProps) {
  const create = useCreateRecurring();
  const update = useUpdateRecurring();

  // Prefill from the editing template (converting its stored UTC schedule to local).
  const initial = editing
    ? utcScheduleToLocal(editing.daysOfWeek, editing.timeUtcMinutes)
    : null;

  const form = useForm<RecurringFormValues>({
    resolver: zodResolver(recurringFormSchema),
    defaultValues: {
      description: editing?.description ?? "",
      projectId: editing?.projectId ?? null,
      taskId: editing?.taskId ?? null,
      tags: editing?.tags ?? [],
      billable: editing?.billable ?? DEFAULT_ENTRY_BILLABLE,
      durationMinutes: editing ? Math.round(editing.durationSeconds / 60) : 30,
      days: initial?.days ?? [1, 2, 3, 4, 5],
      time: minutesToHHMM(initial?.minutes ?? 9 * 60),
    },
  });

  const projectId = useWatch({ control: form.control, name: "projectId" });
  const days = useWatch({ control: form.control, name: "days" });

  const toggleDay = (d: number) =>
    form.setValue(
      "days",
      days.includes(d) ? days.filter((x) => x !== d) : [...days, d],
      { shouldValidate: true }
    );

  const onSubmit = form.handleSubmit((values) => {
    if (!values.projectId) return;
    const { daysOfWeek, timeUtcMinutes } = localScheduleToUtc(values.days, hhmmToMinutes(values.time));
    const payload = {
      description: values.description,
      projectId: values.projectId,
      taskId: values.taskId,
      tags: values.tags,
      billable: values.billable,
      durationSeconds: values.durationMinutes * 60,
      daysOfWeek,
      timeUtcMinutes,
    };
    if (editing) {
      update.mutate({ id: editing.id, data: payload }, { onSuccess: onClose });
    } else {
      create.mutate(payload, { onSuccess: onClose });
    }
  });

  const pending = create.isPending || update.isPending;
  // Mirrors the schema's own gates (project required, at least one day) so Save
  // is visibly disabled rather than clickable-then-erroring.
  const canSubmit = Boolean(projectId) && days.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit recurring entry" : "New recurring entry"}</DialogTitle>
        </DialogHeader>

        <form className="space-y-4" onSubmit={onSubmit} noValidate>
          <Field>
            <FieldLabel htmlFor="rec-desc">Description</FieldLabel>
            <Input id="rec-desc" {...form.register("description")} placeholder="e.g. Daily standup" autoFocus />
            <FieldMessage name="description" />
          </Field>

          <div className="flex flex-wrap items-center gap-2">
            <Controller
              control={form.control}
              name="projectId"
              render={({ field }) => (
                <ProjectPicker
                  value={field.value}
                  onChange={(id) => {
                    field.onChange(id);
                    form.setValue("taskId", null);
                  }}
                />
              )}
            />
            <Controller
              control={form.control}
              name="taskId"
              render={({ field }) => (
                <TaskPicker projectId={projectId} value={field.value} onChange={field.onChange} />
              )}
            />
            <Controller
              control={form.control}
              name="tags"
              render={({ field }) => <TagPicker value={field.value} onChange={field.onChange} />}
            />
            <FieldMessage name="projectId" className="w-full" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <FieldLabel htmlFor="rec-dur">Duration (minutes)</FieldLabel>
              <Input
                id="rec-dur"
                type="number"
                min={1}
                max={1440}
                {...form.register("durationMinutes", { valueAsNumber: true })}
              />
              <FieldMessage name="durationMinutes" />
            </Field>
            <Field>
              <FieldLabel htmlFor="rec-time">Time of day</FieldLabel>
              <Input id="rec-time" type="time" {...form.register("time")} />
            </Field>
          </div>

          <Field>
            <FieldLabel>Repeat on</FieldLabel>
            <div className="flex flex-wrap gap-1.5">
              {DAY_ORDER.map((d) => (
                // raw: a 7-way toggle-pill grid, not a single button action
                <button
                  key={d}
                  type="button"
                  aria-pressed={days.includes(d)}
                  onClick={() => toggleDay(d)}
                  className={cn(
                    "h-8 w-11 rounded-md border text-xs font-medium transition-colors duration-fast ease-out-quart",
                    days.includes(d)
                      ? "border-primary bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {dayLabel(d)}
                </button>
              ))}
            </div>
            <FieldMessage name="days" />
          </Field>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <FieldLabel htmlFor="rec-billable">Billable</FieldLabel>
              <SettingsHint>
                Mark each generated entry as billable.
              </SettingsHint>
            </div>
            <Controller
              control={form.control}
              name="billable"
              render={({ field }) => (
                <Switch id="rec-billable" checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit || pending}>
              {editing ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
