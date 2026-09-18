import { ClipboardList, MessageCircle, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MentionInput } from "./MentionInput";
import { SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";
import type { Task } from "@shared/schemas";

interface TaskSheetHeaderProps {
  task: Task;
  name: string;
  onNameChange: (value: string) => void;
  onSaveName: () => void;
  commentsCount: number;
  /** "@" in the name lists these; the picked name is written into the text (a name has no tags or notifications). */
  members: WorkspaceMember[];
  onDeleteTask: () => void;
}

/** Top action bar + tab switcher + editable title — pure view, rendered inside the sheet's own `<Tabs>`. */
export function TaskSheetHeader({ task, name, onNameChange, onSaveName, commentsCount, members, onDeleteTask }: TaskSheetHeaderProps) {
  return (
    <>
      {/* The border is what separates this chrome strip from the tabs below it. Actions on
          the left, matching EntryFormSheet's built-in top-right close — "..." rather than a
          bare trash icon, so delete isn't a stray misclick. */}
      <div className="flex h-12 shrink-0 items-center border-b px-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Task actions"
              title="Task actions"
              className="text-muted-foreground"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem variant="destructive" onClick={onDeleteTask}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete task
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* A thin underline, not a filled pill — this is a secondary switch, not the header. */}
      <TabsList variant="line" className="mx-6 mt-2 h-auto self-start p-0">
        <TabsTrigger value="task" className="gap-1.5 px-2 py-1.5">
          <ClipboardList className="h-3.5 w-3.5" />
          Task
        </TabsTrigger>
        <TabsTrigger value="comments" className="gap-1.5 px-2 py-1.5">
          <MessageCircle className="h-3.5 w-3.5" />
          Comments
          {commentsCount > 0 && <span className="tabular-nums text-muted-foreground">{commentsCount}</span>}
        </TabsTrigger>
      </TabsList>

      {/* The name, right below the tab switcher rather than above it — visible on
          both tabs, since "whose comments am I reading" matters there too. */}
      <SheetHeader className="px-6 pb-2 pt-3">
        <SheetTitle className="sr-only">{task.name}</SheetTitle>
        <MentionInput
          variant="title"
          members={members}
          rows={1}
          value={name}
          onValueChange={onNameChange}
          onBlur={onSaveName}
          onKeyDown={(e) => {
            // A name is one line that wraps: Enter confirms instead of adding a break.
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          aria-label="Task name"
        />
      </SheetHeader>
    </>
  );
}
