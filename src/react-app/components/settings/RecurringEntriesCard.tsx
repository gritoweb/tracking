import { useState } from "react";
import { Plus, Pencil, Trash2, Repeat } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ProjectBadge } from "@/components/ProjectBadge";
import { SettingsCardHeader } from "./SettingsCardHeader";
import { SettingsListItem } from "./SettingsListItem";
import { RecurringEntryDialog } from "./RecurringEntryDialog";
import {
  useRecurringEntries,
  useUpdateRecurring,
  useDeleteRecurring,
} from "@/hooks/useRecurring";
import {
  utcScheduleToLocal,
  minutesToHHMM,
  formatDays,
} from "@/lib/recurrence";
import { formatDurationShort } from "@/lib/dateUtils";
import type { RecurringEntry } from "@shared/schemas";

function scheduleLabel(r: RecurringEntry): string {
  const { days, minutes } = utcScheduleToLocal(r.daysOfWeek, r.timeUtcMinutes);
  return `${formatDays(days)} · ${minutesToHHMM(minutes)} · ${formatDurationShort(r.durationSeconds)}`;
}

export function RecurringEntriesCard() {
  const { data: items = [] } = useRecurringEntries();
  const updateRecurring = useUpdateRecurring();
  const deleteRecurring = useDeleteRecurring();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringEntry | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RecurringEntry | null>(null);

  const openNew = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (r: RecurringEntry) => {
    setEditing(r);
    setDialogOpen(true);
  };

  return (
    <Card>
      <SettingsCardHeader
        icon={Repeat}
        title="Recurring entries"
        action={
          <Button variant="outline" size="sm" className="gap-1.5" onClick={openNew}>
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        }
      />
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-sm leading-normal text-muted-foreground">
            Auto-log routine time — a standup, a daily review — on a weekly schedule.
            New occurrences are created automatically at the scheduled time.
          </p>
        ) : (
          items.map((r) => (
            <SettingsListItem
              key={r.id}
              title={
                <>
                  <span className="truncate text-sm font-medium">
                    {r.description || <span className="text-muted-foreground">(no description)</span>}
                  </span>
                  {r.projectName && <ProjectBadge name={r.projectName} color={r.projectColor} />}
                </>
              }
              subtitle={scheduleLabel(r)}
            >
              <div className="flex shrink-0 items-center gap-1">
                <Switch
                  checked={r.active}
                  onCheckedChange={(checked) =>
                    updateRecurring.mutate({ id: r.id, data: { active: checked } })
                  }
                  aria-label={r.active ? "Pause" : "Resume"}
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground"
                  onClick={() => openEdit(r)}
                  aria-label="Edit recurring entry"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost-destructive"
                  size="icon-sm"
                  onClick={() => setDeleteTarget(r)}
                  aria-label="Delete recurring entry"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </SettingsListItem>
          ))
        )}
      </CardContent>

      {dialogOpen && (
        <RecurringEntryDialog
          key={editing?.id ?? "new"}
          open={dialogOpen}
          editing={editing}
          onClose={() => setDialogOpen(false)}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete recurring entry?"
        description={`"${deleteTarget?.description || "(no description)"}" will stop generating new time entries. This can't be undone.`}
        onConfirm={() => {
          if (deleteTarget) deleteRecurring.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </Card>
  );
}
