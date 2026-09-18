import { Plus } from "lucide-react";
import { CommandItem } from "@/components/ui/command";

/** "Create <name>" row — opens the panel where the name and its client are confirmed. */
export function ProjectPickerCreateItem({
  name,
  onCreate,
  standalone = false,
}: {
  name: string;
  onCreate: () => void;
  /** Rendered outside a CommandGroup (inside CommandEmpty), which cmdk does
      not treat as selectable — so it needs to be a real button. */
  standalone?: boolean;
}) {
  const content = (
    <>
      <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">
        Create <span className="font-medium">{name}</span>…
      </span>
    </>
  );

  if (standalone) {
    return (
      <button
        type="button"
        onClick={onCreate}
        className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors duration-fast ease-out-quart hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
      >
        {content}
      </button>
    );
  }

  return (
    <CommandItem value={`__create__${name}`} keywords={[name]} onSelect={onCreate}>
      {content}
    </CommandItem>
  );
}
