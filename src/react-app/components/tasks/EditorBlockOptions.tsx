import { cn } from "@/lib/utils";
import type { EditorBlock } from "./editorBlocks";

/** The list a "/" opens: the block types a line can become, with the highlighted one for the keyboard. */
export function EditorBlockOptions({
  items,
  active,
  onPick,
}: {
  items: EditorBlock[];
  active: number;
  onPick: (block: EditorBlock) => void;
}) {
  return (
    <ul role="listbox" aria-label="Insert block">
      {items.map((block, i) => (
        <li key={block.id} role="option" aria-selected={i === active}>
          <button
            type="button"
            // mousedown, not click: the editor must keep focus (and its caret) while a block is picked.
            onMouseDown={(e) => {
              e.preventDefault();
              onPick(block);
            }}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
              i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
            )}
          >
            <block.icon className="h-4 w-4 text-muted-foreground" />
            {block.label}
          </button>
        </li>
      ))}
    </ul>
  );
}
