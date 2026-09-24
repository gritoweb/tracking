import type { ReactNode } from "react";
import { ClipboardList, MessageCircle } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { TaskTab } from "@shared/task-links";

interface TaskSidebarShellProps {
  open: boolean;
  onClose: () => void;
  taskName: string;
  tab: TaskTab;
  onTabChange: (tab: TaskTab) => void;
  commentsCount: number;
  toolbar: ReactNode;
  title: ReactNode;
  content: ReactNode;
  comments: ReactNode;
}

/** The task detail as a side panel: Task and Comments behind tabs, the active one kept in the URL. */
export function TaskSidebarShell({
  open,
  onClose,
  taskName,
  tab,
  onTabChange,
  commentsCount,
  toolbar,
  title,
  content,
  comments,
}: TaskSidebarShellProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 rounded-l-none p-0 sm:max-w-xl sm:rounded-l-container">
        <Tabs value={tab} onValueChange={(v) => onTabChange(v as TaskTab)} className="min-h-0 flex-1">
          {toolbar}

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

          {/* Below the tab switcher so it shows on both tabs: "whose comments am I reading" matters there too. */}
          <SheetHeader className="px-6 pb-2 pt-3">
            <SheetTitle className="sr-only">{taskName}</SheetTitle>
            {title}
          </SheetHeader>

          <TabsContent value="task" className="min-h-0 space-y-5 overflow-y-auto px-6 py-5">
            {content}
          </TabsContent>

          <TabsContent value="comments" className="min-h-0 overflow-y-auto px-6 py-5">
            {comments}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}
