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
import { armVerticalDrag } from "./blockDrop";

/** How far to shift the handle so it centres on the block's first line of text, not on the top of its box (an H1's box is tall). */
function firstLineOffset(editor: Editor, pos: number): number {
  const dom = editor.view.nodeDOM(pos);
  const handle = editor.view.dom.parentElement?.querySelector<HTMLElement>(".tt-block-handle");
  if (!(dom instanceof HTMLElement) || !handle) return 0;
  const box = dom.getBoundingClientRect();
  let center: number;
  const text = document.createTreeWalker(dom, NodeFilter.SHOW_TEXT, (n) =>
    n.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
  ).nextNode();
  if (text) {
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 1);
    const line = range.getClientRects()[0] ?? range.getBoundingClientRect();
    center = (line.top + line.bottom) / 2;
  } else {
    // An empty line has no glyph to measure: centre on its line box instead.
    const style = getComputedStyle(dom);
    const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
    center = box.top + (parseFloat(style.paddingTop) || 0) + lineHeight / 2;
  }
  return center - box.top - handle.offsetHeight / 2;
}

/** The "+ ⠿" beside the hovered line: "+" opens the "/" menu on a new line below, "⠿" drags the line or opens its menu. */
export function BlockHandle({ editor }: { editor: Editor }) {
  const [target, setTarget] = useState<HandleTarget | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [offset, setOffset] = useState(0);

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
      className="tt-block-handle"
      // Top-level blocks only, so the handle keeps one column instead of hopping right onto list items.
      onElementDragStart={() => armVerticalDrag(editor)}
      onNodeChange={({ node, pos }) => {
        if (menuOpen) return;
        setTarget(node ? { node, pos } : null);
        // Measured now: the plugin places the handle right after this call, on this same block.
        if (node) setOffset(firstLineOffset(editor, pos));
      }}
    >
      <div className="flex items-center pr-1" style={{ transform: `translateY(${offset}px)` }}>
        {/* "+" only on an empty line; a line with text shows just the grip, which keeps the gutter quiet. */}
        {target?.node.content.size === 0 && (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Add a block below"
            title="Add a block below"
            className="text-muted-foreground"
            // Keeps the editor focused, so a click here isn't a blur that autosaves the description.
            onMouseDown={(e) => e.preventDefault()}
            onClick={act((t) => insertBelowWithSlash(editor, t))}
          >
            <Plus />
          </Button>
        )}
        <DropdownMenu open={menuOpen} onOpenChange={openMenu}>
          <div className="relative">
            {/* The grip is a plain span: a Radix trigger or a <button> under the pointer keeps the native drag from starting. */}
            <Button asChild variant="ghost" size="icon-sm" className="cursor-grab text-muted-foreground active:cursor-grabbing">
              <span
                role="button"
                tabIndex={0}
                aria-label="Drag to move, click for options"
                title="Drag to move, click for options"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => openMenu(!menuOpen)}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  openMenu(!menuOpen);
                }}
              >
                <GripVertical />
              </span>
            </Button>
            {/* Where the menu opens from; takes no pointer events, so it never competes with the grip. */}
            <DropdownMenuTrigger asChild>
              <span aria-hidden tabIndex={-1} className="pointer-events-none absolute inset-0" />
            </DropdownMenuTrigger>
          </div>
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
