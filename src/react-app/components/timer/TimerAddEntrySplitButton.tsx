import { Plus, Sparkles, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TimerAddEntrySplitButtonProps {
  onAddEntry: () => void;
  onAiQuickAdd: () => void;
}

/**
 * Add entry stays a single click (it's the primary action here); AI quick-add
 * moves behind the caret rather than sitting at equal weight beside it. Pure view.
 */
export function TimerAddEntrySplitButton({ onAddEntry, onAiQuickAdd }: TimerAddEntrySplitButtonProps) {
  return (
    <div className="flex items-center rounded-md border">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" className="rounded-r-none" onClick={onAddEntry} aria-label="Add entry">
            <Plus className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Add entry</TooltipContent>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Same icon-sm token as its sibling: a shorter caret left gaps
              inside the shared border and needed an arbitrary divider. The
              separator is the button's own left border. */}
          <Button variant="ghost" size="icon-sm" className="w-6 rounded-l-none border-l" aria-label="More ways to add">
            <ChevronDown className="h-3 w-3 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onAiQuickAdd}>
            <Sparkles className="mr-2 h-3.5 w-3.5" />
            Add with AI…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
