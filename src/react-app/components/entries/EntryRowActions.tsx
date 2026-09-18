import { Play, Trash2, MoreHorizontal, Edit2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { Integration, TimeEntry } from "@shared/schemas";

interface EntryRowActionsProps {
  entry: TimeEntry;
  integration?: Integration;
  isCompleted: boolean;
  isPushing: boolean;
  onContinue: () => void;
  onEdit: () => void;
  onPush: () => void;
  onDelete: () => void;
}

/** The row's hover-revealed Continue button and "…" action menu. */
export function EntryRowActions({
  entry,
  integration,
  isCompleted,
  isPushing,
  onContinue,
  onEdit,
  onPush,
  onDelete,
}: EntryRowActionsProps) {
  return (
    <div className="tt-reveal flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Continue timing this entry" onClick={onContinue}>
            <Play className="h-3.5 w-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Continue</TooltipContent>
      </Tooltip>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Entry actions">
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={onEdit}>
            <Edit2 className="mr-2 h-3.5 w-3.5" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={onContinue}>
            <Play className="mr-2 h-3.5 w-3.5" />
            Continue
          </DropdownMenuItem>
          {integration && (
            <DropdownMenuItem onClick={onPush} disabled={isPushing || (!isCompleted && entry.syncStatus !== "error")}>
              <Upload className="mr-2 h-3.5 w-3.5" />
              {entry.syncStatus === "synced"
                ? "Push again"
                : entry.syncStatus === "error"
                  ? "Retry push"
                  : "Push to integration"}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="text-destructive" onClick={onDelete}>
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
