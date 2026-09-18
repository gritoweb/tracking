import { Badge } from "@/components/ui/badge";
import { ClearButton } from "@/components/ui/clear-button";
import { ColorDot } from "@/components/ColorDot";

interface TimerBarTagListProps {
  tags: string[];
  tagColor: (name: string) => string;
  onRemove: (name: string) => void;
}

/** Tags carried over from a suggestion/favorite — removable, but only addable via those paths. */
export function TimerBarTagList({ tags, tagColor, onRemove }: TimerBarTagListProps) {
  if (tags.length === 0) return null;
  return (
    <span className="flex shrink-0 items-center gap-1">
      {tags.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 pr-1 text-xs font-normal">
          <ColorDot color={tagColor(tag)} className="h-1.5 w-1.5" />
          <span className="max-w-32 truncate">{tag}</span>
          <ClearButton aria-label={`Remove tag ${tag}`} onClick={() => onRemove(tag)} />
        </Badge>
      ))}
    </span>
  );
}
