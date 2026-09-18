import { formatDistanceToNow } from "date-fns";
import { Avatar } from "@/components/ui/avatar";
import { describeActivity } from "@/lib/taskActivity";
import type { TaskActivity } from "@shared/schemas";

/** One change to the task, as a quiet line in the comments feed. */
export function TaskActivityRow({ activity }: { activity: TaskActivity }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 text-xs text-muted-foreground">
      <Avatar name={activity.userName} image={activity.userImage} size="xs" className="mt-0.5 shrink-0" />
      <p className="min-w-0 flex-1 leading-normal">
        <span className="font-medium text-foreground">{activity.userName}</span>{" "}
        {describeActivity(activity).map((segment, i) =>
          segment.strong ? (
            <span key={i} className="font-medium text-foreground">
              {segment.text}
            </span>
          ) : (
            <span key={i}>{segment.text}</span>
          )
        )}
        <span className="text-micro" title={new Date(activity.createdAt).toLocaleString()}>
          {" · "}
          {formatDistanceToNow(new Date(activity.createdAt), { addSuffix: true })}
        </span>
      </p>
    </div>
  );
}
