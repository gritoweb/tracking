import { AtSign, X } from "lucide-react";
import { MultiSelect } from "@/components/pickers/MultiSelect";
import type { Member } from "./TaskComments";

/** Who gets @mentioned — typing "@" opens the same picker a click on the pill would. */
export function MentionPicker({
  members,
  value,
  onChange,
  open,
  onOpenChange,
}: {
  members: Member[];
  value: string[];
  onChange: (ids: string[]) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <MultiSelect
        label="Mention"
        options={members.map((m) => ({ value: m.userId, label: m.name, image: m.image }))}
        value={value}
        onChange={onChange}
        open={open}
        onOpenChange={onOpenChange}
        trigger={
          <button
            type="button"
            aria-label="Mention someone"
            className="flex h-6 items-center gap-1 rounded-full border border-dashed px-2 text-micro text-muted-foreground hover:border-muted-foreground hover:text-foreground"
          >
            <AtSign className="h-3 w-3" />
            Mention
          </button>
        }
      />
      {value.map((id) => {
        const member = members.find((m) => m.userId === id);
        if (!member) return null;
        return (
          <span key={id} className="flex items-center gap-1 rounded-full bg-muted py-0.5 pl-2 pr-1 text-micro">
            {member.name}
            <button
              type="button"
              aria-label={`Remove ${member.name}`}
              onClick={() => onChange(value.filter((x) => x !== id))}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          </span>
        );
      })}
    </div>
  );
}
