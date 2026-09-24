import { useRef } from "react";
import type { Editor } from "@tiptap/react";
import { AtSign, Paperclip, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { insertUploadedImage } from "./editorUpload";
import { markHandleSlash } from "./useEditorSlashCommands";

interface EditorToolbarProps {
  editor: Editor;
  /** Without it there is nothing to upload to, so the clip isn't offered. */
  onUploadImage?: (file: File) => Promise<{ url: string; id: string }>;
  onDeleteImage?: (id: string) => void;
}

/** The row under a compact editor (a comment): "+" for the block menu, a clip for an image, "@" to tag someone. */
export function EditorToolbar({ editor, onUploadImage, onDeleteImage }: EditorToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  // What typing it would do: the same "/" and "@" menus open at the caret, so there is one menu of each, not two.
  const type = (text: string, fromButton = false) => {
    if (fromButton) markHandleSlash(editor);
    const { from, $from } = editor.state.selection;
    // The menus open only at the start of a word; a space keeps "word@" from reading as an e-mail.
    const lead = $from.parentOffset > 0 && !/\s$/.test($from.parent.textBetween(0, $from.parentOffset)) ? " " : "";
    editor.chain().focus().insertContentAt(from, lead + text).run();
  };

  return (
    <div className="flex items-center gap-0.5" role="toolbar" aria-label="Insert">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground"
        aria-label="Insert a block"
        title="Insert a block"
        // Keeps the caret where it is; the click would otherwise blur the editor first.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => type("/", true)}
      >
        <Plus />
      </Button>
      {onUploadImage && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label="Attach an image"
            title="Attach an image"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip />
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) insertUploadedImage(editor.view, editor.state.selection.from, file, onUploadImage, onDeleteImage);
            }}
          />
        </>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground"
        aria-label="Mention someone"
        title="Mention someone"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => type("@")}
      >
        <AtSign />
      </Button>
    </div>
  );
}
