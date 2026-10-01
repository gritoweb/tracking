import { useState } from "react";
import { ArrowLeft, ArrowRight, Archive, ArchiveRestore, Check, CheckSquare, MoreHorizontal, Pencil, Square } from "lucide-react";
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
import { ColorSwatchPicker } from "@/components/ui/color-swatch-picker";
import { useUpdateTaskStatus } from "@/hooks/useTaskStatuses";
import { midpointOrder, STATUS_CATEGORY_LABEL } from "@/lib/taskUtils";
import type { TaskStatus, TaskStatusCategory } from "@shared/schemas";

interface StatusColumnMenuProps {
  status: TaskStatus;
  /** Every live column, in board order — reordering reads it. */
  statuses: TaskStatus[];
  taskCount: number;
  /** The board's own project scope — editing a column shown as the global fallback forks it for this project first. */
  projectId: string | null;
  /** Configuring the column is owner/admin only; the task actions above it are everyone's. */
  canManage: boolean;
  onSelectAll: () => void;
  /** Every card of the column is selected: the item reads "Deselect all" and clears them. */
  allSelected: boolean;
  onArchiveAll: () => void;
  /** Like Delete: shown only when every task in the column is the person's to archive. */
  canArchiveAll: boolean;
  /** Every task in the column is archived ("Show archived"): the item unarchives them instead. */
  allArchived: boolean;
}

/** Configuring a column. Every rule enforced here is refused server-side too — this just says why sooner. */
export function StatusColumnMenu({ status, statuses, taskCount, projectId, canManage, onSelectAll, allSelected, onArchiveAll, canArchiveAll, allArchived }: StatusColumnMenuProps) {
  const update = useUpdateTaskStatus(projectId);
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(status.name);

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
            aria-label={canManage ? `Configure ${status.name}` : `${status.name} options`}
            className="shrink-0 text-muted-foreground"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem disabled={taskCount === 0} onClick={onSelectAll}>
            {allSelected ? <Square className="mr-2 h-3.5 w-3.5" /> : <CheckSquare className="mr-2 h-3.5 w-3.5" />}
            {allSelected ? "Deselect all" : "Select all"}
          </DropdownMenuItem>
          {canManage && (
            <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => { setName(status.name); setRenaming(true); }}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Rename
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>Color</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-auto p-2">
              <ColorSwatchPicker
                value={status.color}
                onChange={(color) => update.mutate({ id: status.id, data: { color } })}
                size="sm"
                columns={6}
              />
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
            </>
          )}

          {canArchiveAll && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" disabled={taskCount === 0} onClick={onArchiveAll}>
                {allArchived ? <ArchiveRestore className="mr-2 h-3.5 w-3.5" /> : <Archive className="mr-2 h-3.5 w-3.5" />}
                {allArchived ? "Unarchive all tasks" : "Archive all tasks"}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

    </>
  );
}
