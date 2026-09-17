import { useState } from "react";
import { ArrowLeft, ArrowRight, Archive, Check, MoreHorizontal, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SWATCH_COLORS, SWATCH_COLOR_NAMES } from "@shared/colors";
import { useArchiveTaskStatus, useUpdateTaskStatus } from "@/hooks/useTaskStatuses";
import { midpointOrder, STATUS_CATEGORY_LABEL } from "@/lib/taskUtils";
import { cn } from "@/lib/utils";
import type { TaskStatus, TaskStatusCategory } from "@shared/schemas";

interface StatusColumnMenuProps {
  status: TaskStatus;
  /** Every live column, in board order — reordering and the archive target read it. */
  statuses: TaskStatus[];
  taskCount: number;
  /** The board's own project scope — editing a column shown as the global fallback forks it for this project first. */
  projectId: string | null;
}

/** Configuring a column. Every rule enforced here is refused server-side too — this just says why sooner. */
export function StatusColumnMenu({ status, statuses, taskCount, projectId }: StatusColumnMenuProps) {
  const update = useUpdateTaskStatus(projectId);
  const archive = useArchiveTaskStatus(projectId);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(status.name);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [moveTo, setMoveTo] = useState<string>("");

  const index = statuses.findIndex((s) => s.id === status.id);
  const others = statuses.filter((s) => s.id !== status.id);
  const lastCompleted = status.category === "completed" && !others.some((s) => s.category === "completed");
  const lastOpen = status.category !== "completed" && !others.some((s) => s.category !== "completed");

  const saveName = () => {
    const next = name.trim();
    setRenaming(false);
    if (!next || next === status.name) {
      setName(status.name);
      return;
    }
    update.mutate({ id: status.id, data: { name: next } });
  };

  /** Slide one place: the new position is the midpoint past its new neighbour. */
  const move = (direction: -1 | 1) => {
    const target = index + direction;
    const before = direction === -1 ? statuses[target - 1] ?? null : statuses[target] ?? null;
    const after = direction === -1 ? statuses[target] ?? null : statuses[target + 1] ?? null;
    update.mutate({
      id: status.id,
      data: { sortOrder: midpointOrder(before?.sortOrder ?? null, after?.sortOrder ?? null) },
    });
  };

  const confirmArchive = () => {
    archive.mutate(
      { id: status.id, ...(taskCount > 0 ? { moveTo } : {}) },
      { onSuccess: () => setArchiveOpen(false) }
    );
  };

  if (renaming) {
    return (
      <Input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        onKeyDown={(e) => {
          if (e.key === "Enter") saveName();
          if (e.key === "Escape") {
            setName(status.name);
            setRenaming(false);
          }
        }}
        aria-label="Status name"
        className="h-6 py-0 text-sm"
      />
    );
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Configure ${status.name}`}
            className="shrink-0 text-muted-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => { setName(status.name); setRenaming(true); }}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Rename
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Color</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-auto p-2">
              <div className="grid grid-cols-6 gap-1">
                {SWATCH_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={SWATCH_COLOR_NAMES[color] ?? color}
                    title={SWATCH_COLOR_NAMES[color] ?? color}
                    onClick={() => update.mutate({ id: status.id, data: { color } })}
                    style={{ backgroundColor: color }}
                    className={cn(
                      "flex h-5 w-5 items-center justify-center rounded-full",
                      "transition-transform duration-fast ease-out-quart hover:scale-110",
                      "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    )}
                  >
                    {color === status.color && <Check className="h-3 w-3 text-white" />}
                  </button>
                ))}
              </div>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Type</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuLabel className="text-micro font-normal text-muted-foreground">
                Tasks in a completed type are done
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={status.category}
                onValueChange={(v) =>
                  update.mutate({ id: status.id, data: { category: v as TaskStatusCategory } })
                }
              >
                {(Object.keys(STATUS_CATEGORY_LABEL) as TaskStatusCategory[]).map((category) => (
                  <DropdownMenuRadioItem
                    key={category}
                    value={category}
                    disabled={
                      (lastCompleted && category !== "completed") ||
                      (lastOpen && category === "completed")
                    }
                  >
                    {STATUS_CATEGORY_LABEL[category]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuItem
            disabled={status.isDefault || status.category === "completed"}
            onClick={() => update.mutate({ id: status.id, data: { isDefault: true } })}
          >
            <Check className="mr-2 h-3.5 w-3.5" />
            {status.isDefault ? "Default for new tasks" : "Make default"}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem disabled={index <= 0} onClick={() => move(-1)}>
            <ArrowLeft className="mr-2 h-3.5 w-3.5" />
            Move left
          </DropdownMenuItem>
          <DropdownMenuItem disabled={index >= statuses.length - 1} onClick={() => move(1)}>
            <ArrowRight className="mr-2 h-3.5 w-3.5" />
            Move right
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant="destructive"
            disabled={lastCompleted || lastOpen || statuses.length <= 1}
            onClick={() => {
              setMoveTo(others[0]?.id ?? "");
              setArchiveOpen(true);
            }}
          >
            <Archive className="mr-2 h-3.5 w-3.5" />
            Archive
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* A column that still holds work must say where it goes — the server refuses it too. */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive “{status.name}”?</DialogTitle>
            <DialogDescription>
              {taskCount > 0
                ? `${taskCount} task${taskCount === 1 ? "" : "s"} still sit${taskCount === 1 ? "s" : ""} in this status. Choose where they go.`
                : "The column disappears from the board. Nothing is deleted."}
            </DialogDescription>
          </DialogHeader>

          {taskCount > 0 && (
            <Select value={moveTo} onValueChange={setMoveTo}>
              <SelectTrigger aria-label="Move tasks to">
                <SelectValue placeholder="Move tasks to…" />
              </SelectTrigger>
              <SelectContent>
                {others.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={(taskCount > 0 && !moveTo) || archive.isPending}
              onClick={confirmArchive}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
