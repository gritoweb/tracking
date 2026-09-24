import { useState } from "react";
import { DragHandle } from "@tiptap/extension-drag-handle-react";
import type { Editor } from "@tiptap/react";
import { Copy, GripVertical, Palette, Plus, Repeat2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ColorSwatchPicker } from "@/components/ui/color-swatch-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TURN_INTO_BLOCKS } from "./editorBlocks";
import {
  colorBlock,
  deleteBlock,
  duplicateBlock,
  insertBelowWithSlash,
  turnBlockInto,
  type HandleTarget,
} from "./blockActions";

/** The "+ ⠿" beside the hovered line: "+" opens the "/" menu on a new line below, "⠿" drags the line or opens its menu. */
export function BlockHandle({ editor }: { editor: Editor }) {
  const [target, setTarget] = useState<HandleTarget | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const openMenu = (open: boolean) => {
    setMenuOpen(open);
    // Pinned while the menu is open; a meta because the React component's bare plugin has no lock commands.
    editor.commands.setMeta("lockDragHandle", open);
  };

  const act = (run: (t: HandleTarget) => void) => () => {
    if (target) run(target);
  };

  return (
    <DragHandle
      editor={editor}
      nested
      className="tt-block-handle"
      onNodeChange={({ node, pos }) => {
        if (!menuOpen) setTarget(node ? { node, pos } : null);
      }}
    >
      <div className="flex items-center pr-1">
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Add a block below"
          title="Add a block below"
          className="text-muted-foreground"
          // Keeps the editor focused, so a click here isn't a blur that autosaves the description.
          onMouseDown={(e) => e.preventDefault()}
          onClick={act((t) => insertBelowWithSlash(editor, t))}
        >
          <Plus />
        </Button>
        <DropdownMenu open={menuOpen} onOpenChange={openMenu}>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Drag to move, click for options"
              title="Drag to move, click for options"
              className="cursor-grab text-muted-foreground active:cursor-grabbing"
              // Radix opens on pointerdown, which would open the menu at the start of every drag; open on click instead.
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => openMenu(!menuOpen)}
            >
              <GripVertical />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="bottom" align="start" className="w-52">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Repeat2 />
                Turn into
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                {TURN_INTO_BLOCKS.map((block) => (
                  <DropdownMenuItem key={block.id} onSelect={act((t) => turnBlockInto(editor, t, block))}>
                    <block.icon />
                    {block.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Palette />
                Color
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="flex items-end gap-2 p-2">
                <ColorSwatchPicker
                  size="sm"
                  value=""
                  onChange={(color) => {
                    if (target) colorBlock(editor, target, color);
                    openMenu(false);
                  }}
                  aria-label="Line color"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    if (target) colorBlock(editor, target, null);
                    openMenu(false);
                  }}
                >
                  Default
                </Button>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onSelect={act((t) => duplicateBlock(editor, t))}>
              <Copy />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={act((t) => deleteBlock(editor, t))}>
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </DragHandle>
  );
}
