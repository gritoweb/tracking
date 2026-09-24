import { useState, type ReactNode } from "react";
import { useEditorState, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import {
  Bold,
  Code,
  Italic,
  Link,
  Palette,
  Strikethrough,
  Underline,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ColorSwatchPicker } from "@/components/ui/color-swatch-picker";
import { floatingToolbarVariants } from "@/components/ui/floating-toolbar-variants";
import { normalizeLinkHref } from "@/lib/richText";
import { EDITOR_BLOCKS, type EditorBlock } from "./editorBlocks";

function ToolButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon-sm"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

const Divider = () => <div className="mx-0.5 h-5 w-px bg-border" aria-hidden />;

/** The formatting bar that floats over a text selection — ClickUp's description editing, on tiptap. */
export function RichTextBubbleMenu({ editor }: { editor: Editor }) {
  // One secondary row at a time under the buttons: the color swatches or the link field.
  const [panel, setPanel] = useState<"color" | "link" | null>(null);
  const [href, setHref] = useState("");
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      blocks: Object.fromEntries(EDITOR_BLOCKS.map((b) => [b.id, b.isActive(e)])) as Record<string, boolean>,
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      code: e.isActive("code"),
      link: e.isActive("link"),
      color: (e.getAttributes("textStyle").color as string | undefined) ?? "",
    }),
  });
  const chain = () => editor.chain().focus();
  const blockButton = (block: EditorBlock) => (
    <ToolButton key={block.id} label={block.label} active={state.blocks[block.id]} onClick={() => block.apply(chain()).run()}>
      <block.icon className="h-4 w-4" />
    </ToolButton>
  );
  const togglePanel = (next: "color" | "link") => {
    if (next === "link") setHref((editor.getAttributes("link").href as string | undefined) ?? "");
    setPanel((current) => (current === next ? null : next));
  };
  const applyLink = () => {
    const next = normalizeLinkHref(href);
    if (next) chain().extendMarkRange("link").setLink({ href: next }).run();
    else chain().extendMarkRange("link").unsetLink().run();
    setPanel(null);
  };

  return (
    <BubbleMenu
      editor={editor}
      options={{ strategy: "fixed", placement: "top-start", onHide: () => setPanel(null) }}
      // Keeps the editor's selection: a click in the bar must not move focus out of the text it formats (the link field excepted).
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
      }}
      className={floatingToolbarVariants()}
    >
      <div role="toolbar" aria-label="Text formatting" className="flex flex-wrap items-center gap-0.5">
        {EDITOR_BLOCKS.filter((b) => b.group === "type").map(blockButton)}
        <Divider />
        <ToolButton label="Bold" active={state.bold} onClick={() => chain().toggleBold().run()}>
          <Bold className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Italic" active={state.italic} onClick={() => chain().toggleItalic().run()}>
          <Italic className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Underline" active={state.underline} onClick={() => chain().toggleUnderline().run()}>
          <Underline className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Strikethrough" active={state.strike} onClick={() => chain().toggleStrike().run()}>
          <Strikethrough className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Inline code" active={state.code} onClick={() => chain().toggleCode().run()}>
          <Code className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Text color" active={panel === "color"} onClick={() => togglePanel("color")}>
          <Palette className="h-4 w-4" style={state.color ? { color: state.color } : undefined} />
        </ToolButton>
        <ToolButton label="Link" active={state.link || panel === "link"} onClick={() => togglePanel("link")}>
          <Link className="h-4 w-4" />
        </ToolButton>
        <Divider />
        {EDITOR_BLOCKS.filter((b) => b.group === "list").map(blockButton)}
      </div>

      {panel === "link" && (
        <form
          className="flex items-center gap-1.5 border-t px-1 pt-1.5 pb-0.5"
          onSubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
        >
          <Input
            size="sm"
            autoFocus
            aria-label="Link address"
            placeholder="Paste or type a link"
            value={href}
            onChange={(e) => setHref(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                setPanel(null);
                editor.commands.focus();
              }
            }}
          />
          <Button type="submit" size="sm">
            {href.trim() ? "Apply" : "Remove"}
          </Button>
        </form>
      )}

      {panel === "color" && (
        <div className="flex items-end gap-2 border-t px-1.5 pt-2 pb-1">
          <ColorSwatchPicker
            size="sm"
            value={state.color}
            onChange={(color) => chain().setColor(color).run()}
            aria-label="Text color"
          />
          <Button type="button" variant="ghost" size="xs" onClick={() => chain().unsetColor().run()}>
            Default
          </Button>
        </div>
      )}
    </BubbleMenu>
  );
}
