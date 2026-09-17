import { useEffect } from "react";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Image } from "@tiptap/extension-image";
import { cn } from "@/lib/utils";

interface RichTextEditorProps {
  content: JSONContent;
  onBlur: (doc: JSONContent) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  /** A dropped/pasted image uploads through here and lands inline — the only way to attach a file to a task. */
  onUploadImage?: (file: File) => Promise<{ url: string }>;
}

function imageFile(items: DataTransferItemList | FileList | null | undefined): File | null {
  if (!items) return null;
  for (const item of items) {
    const file = "getAsFile" in item ? item.getAsFile() : (item as File);
    if (file?.type.startsWith("image/")) return file;
  }
  return null;
}

/**
 * A task's description: bold/heading/lists plus a markable checklist — tiptap, headless, styled
 * to this app's own tokens rather than its default look. No fixed toolbar — markdown-style typing
 * (`**bold**`, `# heading`, `- item`, `[] item`) is StarterKit's own input rules, not a button row.
 * Autosaves on blur, same as every other field on the sheet — not per keystroke, which would fire
 * a write per letter typed.
 */
export function RichTextEditor({
  content,
  onBlur,
  placeholder,
  className,
  "aria-label": ariaLabel,
  onUploadImage,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false, horizontalRule: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
      Image,
    ],
    content,
    editorProps: {
      attributes: {
        role: "textbox",
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        class: cn("tt-richtext min-h-16 px-0 py-0 text-lg", "focus:outline-none"),
      },
      handlePaste: (view, event) => {
        const file = imageFile(event.clipboardData?.items);
        if (!file || !onUploadImage) return false;
        event.preventDefault();
        const pos = view.state.selection.from;
        onUploadImage(file)
          .then(({ url }) => {
            view.dispatch(view.state.tr.insert(pos, view.state.schema.nodes.image.create({ src: url })));
          })
          .catch(() => {}); // rejection means the upload already reported its own error
        return true;
      },
      handleDrop: (view, event) => {
        const file = imageFile(event.dataTransfer?.files);
        if (!file || !onUploadImage) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
        onUploadImage(file)
          .then(({ url }) => {
            view.dispatch(view.state.tr.insert(pos, view.state.schema.nodes.image.create({ src: url })));
          })
          .catch(() => {});
        return true;
      },
    },
    onBlur: ({ editor: e }) => onBlur(e.getJSON()),
  });

  // The sheet reopens on a different task without remounting this component — sync the content in.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(content);
    if (current !== next) editor.commands.setContent(content);
  }, [editor, content]);

  if (!editor) return null;

  return <EditorContent editor={editor} className={className} />;
}
