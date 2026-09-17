import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, X } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useClearAllNotifications,
  useDeleteNotification,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";
import type { Notification } from "@shared/schemas";

/** The always-visible entry point to a user's own notifications — same slot/style as AssistantButton. */
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  const deleteNotification = useDeleteNotification();
  const clearAll = useClearAllNotifications();
  const notifications = data?.notifications ?? [];
  const unreadCount = data?.unreadCount ?? 0;

  const openNotification = (n: Notification) => {
    if (!n.isRead) markRead.mutate(n.id);
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="tt-touch relative text-muted-foreground"
              aria-label={unreadCount > 0 ? `Notifications — ${unreadCount} unread` : "Notifications"}
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-micro font-medium leading-none text-primary-foreground"
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Notifications</TooltipContent>
      </Tooltip>

      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-3 py-2.5">
          <h3 className="text-sm font-medium">Notifications</h3>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => markAllRead.mutate()}
              >
                Mark all as read
              </Button>
            )}
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 text-xs text-muted-foreground hover:text-destructive"
                onClick={() => clearAll.mutate()}
              >
                Clear all
              </Button>
            )}
          </div>
        </div>

        <div className="max-h-96 overflow-y-auto border-t">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Bell className="h-6 w-6 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nothing yet</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "group/notif flex w-full gap-2.5 border-b px-3 py-2.5 last:border-b-0",
                  "transition-colors duration-fast ease-out-quart hover:bg-accent",
                  !n.isRead && "bg-primary/5"
                )}
              >
                <button type="button" onClick={() => openNotification(n)} className="flex min-w-0 flex-1 gap-2.5 text-left">
                  <span
                    aria-hidden
                    className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", n.isRead ? "bg-transparent" : "bg-primary")}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn("text-sm", !n.isRead && "font-medium")}>{n.title}</p>
                    <p className="line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                    <p className="mt-0.5 text-micro text-muted-foreground/70">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Dismiss notification"
                  onClick={() => deleteNotification.mutate(n.id)}
                  className="tt-reveal shrink-0 self-start text-muted-foreground"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
