import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SWATCH_COLORS, SWATCH_COLOR_NAMES, nextUnusedColor } from "@shared/colors";
import { useCreateTaskStatus } from "@/hooks/useTaskStatuses";
import { STATUS_CATEGORY_LABEL } from "@/lib/taskUtils";
import { cn } from "@/lib/utils";
import type { TaskStatus, TaskStatusCategory } from "@shared/schemas";

interface AddStatusColumnProps {
  statuses: TaskStatus[];
}

/** The `+` at the end of the board — an inline panel, not a dialog, same as `QuickAddTask`. */
export function AddStatusColumn({ statuses }: AddStatusColumnProps) {
  const create = useCreateTaskStatus();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TaskStatusCategory>("active");
  const [color, setColor] = useState(() => nextUnusedColor(statuses.map((s) => s.color)));

  const reset = () => {
    setOpen(false);
    setName("");
    setCategory("active");
    setColor(nextUnusedColor(statuses.map((s) => s.color)));
  };

  const submit = () => {
    if (!name.trim()) return;
    create.mutate({ name: name.trim(), color, category }, { onSuccess: reset });
  };

  if (!open) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setColor(nextUnusedColor(statuses.map((s) => s.color)));
          setOpen(true);
        }}
        className="h-8 w-72 shrink-0 justify-start gap-1.5 text-muted-foreground"
      >
        <Plus className="h-4 w-4" />
        Add status
      </Button>
    );
  }

  return (
    <div className="flex w-72 shrink-0 flex-col gap-3 rounded-container bg-muted/40 p-3">
      <div className="space-y-1.5">
        <Label htmlFor="new-status-name">Name</Label>
        <Input
          id="new-status-name"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") reset();
          }}
          placeholder="e.g. Blocked"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="new-status-category">Type</Label>
        <Select value={category} onValueChange={(v) => setCategory(v as TaskStatusCategory)}>
          <SelectTrigger id="new-status-category" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(STATUS_CATEGORY_LABEL) as TaskStatusCategory[]).map((c) => (
              <SelectItem key={c} value={c}>
                {STATUS_CATEGORY_LABEL[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-micro text-muted-foreground">
          Tasks dropped in a completed column count as done.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>Color</Label>
        <div className="grid grid-cols-9 gap-1">
          {SWATCH_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={SWATCH_COLOR_NAMES[c] ?? c}
              title={SWATCH_COLOR_NAMES[c] ?? c}
              aria-pressed={c === color}
              onClick={() => setColor(c)}
              style={{ backgroundColor: c }}
              className={cn(
                "h-5 w-5 rounded-full transition-transform duration-fast ease-out-quart hover:scale-110",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                c === color && "ring-2 ring-foreground ring-offset-2 ring-offset-background"
              )}
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={reset}>
          Cancel
        </Button>
        <Button size="sm" disabled={!name.trim() || create.isPending} onClick={submit}>
          Add status
        </Button>
      </div>
    </div>
  );
}
