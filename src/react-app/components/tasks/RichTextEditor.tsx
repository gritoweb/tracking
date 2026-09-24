import { useEffect, useRef, type ReactNode } from "react";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Image } from "@tiptap/extension-image";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { setMentionMembers, useEditorMentions } from "./useEditorMentions";
import { dropHandleSlash, useEditorSlashCommands } from "./useEditorSlashCommands";
import { RichTextBubbleMenu } from "./RichTextBubbleMenu";
import { BlockHandle } from "./BlockHandle";
import { EditorToolbar } from "./EditorToolbar";
import { imageFile, insertUploadedImage, UploadPlaceholderExtension } from "./editorUpload";
import { refreshMentionLabels } from "@/lib/mentionLabels";
import { cn } from "@/lib/utils";
import { getContrastColor } from "@/lib/colorUtils";
import { NEUTRAL_SWATCH } from "@shared/colors";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";
import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import type { DescriptionCollab } from "@/hooks/useDescriptionCollab";
import { DESCRIPTION_FIELD, SEED_GRANTED, SEED_REQUEST } from "@shared/description-collab";

/** Shown on the empty line the caret sits on, so a blank line says what it's for. */
const LINE_HINT = "Write, or type / for commands";

interface RichTextEditorProps {
  content: JSONContent;
  /** Autosave: the description writes on blur, not per keystroke. */
  onBlur?: (doc: JSONContent) => void;
  /** Every change, for a caller that holds the doc itself (a comment composer). */
  onChange?: (doc: JSONContent) => void;
  /** Ctrl/⌘+Enter: a composer's send. */
  onSubmit?: (doc: JSONContent) => void;
  /** Shows the doc with the same rendering, but nothing to edit: no handle, no menus, no caret. */
  readOnly?: boolean;
  autoFocus?: boolean;
  /** The `EditorToolbar` row under the text ("+", clip, "@"), with `footer` (e.g. a send button) at its end. */
  toolbar?: boolean;
  footer?: ReactNode;
  /** `document` for a description; `compact` sets the text at the comment size, headings scaling with it. */
  density?: "document" | "compact";
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
  /** A dropped/pasted image uploads through here and lands inline — the only way to attach a file to a task. */
  onUploadImage?: (file: File) => Promise<{ url: string; id: string }>;
  /** Cleans up an attachment that finished uploading but whose insertion spot vanished mid-upload (e.g. that text got deleted). */
  onDeleteImage?: (id: string) => void;
  /** Who "@" can tag; without it the editor has no mentions. */
  members?: WorkspaceMember[];
  /** Classes on the editable element itself, e.g. a left gutter that must count as editor for hover and drop. */
  editorClassName?: string;
  /** Live co-editing room; when set the shared doc is the content and `content` only seeds an empty room. */
  collab?: DescriptionCollab | null;
}

/** Another editor's caret; the name's ink follows the swatch, since white vanishes on the palette's light colours. */
function renderCaret(user: { name?: string; color?: string }) {
  const color = user.color ?? NEUTRAL_SWATCH;
  const caret = document.createElement("span");
  caret.className = "collaboration-carets__caret";
  caret.style.borderColor = color;
  const label = document.createElement("span");
  label.className = "collaboration-carets__label";
  label.style.backgroundColor = color;
  label.style.color = getContrastColor(color);
  label.textContent = user.name ?? "";
  caret.appendChild(label);
  return caret;
}

/**
 * A task's description: headings, marks, text color, lists plus a markable checklist — tiptap, headless,
 * styled to this app's own tokens. No fixed toolbar: selecting text raises `RichTextBubbleMenu`,
 * "/" lists the block types, each line has a "+ ⠿" handle (`BlockHandle`) to add, drag or
 * transform it, and markdown-style typing (`**bold**`, `# heading`) still works.
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
  onDeleteImage,
  members = [],
  collab = null,
  editorClassName,
  onChange,
  onSubmit,
  readOnly = false,
  autoFocus = false,
  toolbar = false,
  footer,
  density = "document",
}: RichTextEditorProps) {
  // tiptap keeps the options it was built with, so the handlers are read through refs to stay current.
  const onChangeRef = useRef(onChange);
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => {
    onChangeRef.current = onChange;
    onSubmitRef.current = onSubmit;
  });
  const mentions = useEditorMentions(members);
  const slash = useEditorSlashCommands();
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        // Yjs brings its own history; the local one would undo other people's typing.
        undoRedo: collab ? false : undefined,
        // The line that shows where a dragged block will land; its colour comes from `.tt-dropcursor`.
        dropcursor: { class: "tt-dropcursor", width: 2, color: false },
      }),
      TextStyle,
      Color,
      TaskList,
      TaskItem.configure({ nested: true }),
      // The field's own placeholder while the whole doc is empty; otherwise a hint on the empty line holding the caret.
      Placeholder.configure({ placeholder: ({ editor: e }) => (e.isEmpty ? (placeholder ?? "") : LINE_HINT) }),
      Image,
      UploadPlaceholderExtension,
      mentions.extension,
      slash.extension,
      ...(collab
        ? [
            Collaboration.configure({ document: collab.doc, field: DESCRIPTION_FIELD }),
            CollaborationCaret.configure({ provider: collab.provider, user: collab.user, render: renderCaret }),
          ]
        : []),
    ],
    content: collab ? undefined : content,
    editable: !readOnly,
    autofocus: autoFocus ? "end" : false,
    onUpdate: ({ editor: e }) => onChangeRef.current?.(e.getJSON()),
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey) || !onSubmitRef.current || !editorRef.current) return false;
        onSubmitRef.current(editorRef.current.getJSON());
        return true;
      },
      attributes: {
        role: "textbox",
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        class: cn(
          "tt-richtext px-0 py-0",
          density === "compact" ? "tt-richtext-compact" : "min-h-16",
          "focus:outline-none",
          editorClassName
        ),
      },
      handleDOMEvents: {
        click: (_view, event) => {
          mentions.onChipClick(event);
          return false;
        },
      },
      handlePaste: (view, event) => {
        const file = imageFile(event.clipboardData?.items);
        if (!file || !onUploadImage) return false;
        event.preventDefault();
        insertUploadedImage(view, view.state.selection.from, file, onUploadImage, onDeleteImage);
        return true;
      },
      handleDrop: (view, event) => {
        const file = imageFile(event.dataTransfer?.files);
        if (!file || !onUploadImage) return false;
        event.preventDefault();
        const pos =
          view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
        insertUploadedImage(view, pos, file, onUploadImage, onDeleteImage);
        return true;
      },
    },
    onBlur: ({ editor: e }) => {
      // A "/" the "+" handle left behind must not be saved as text.
      dropHandleSlash(e);
      onBlur?.(e.getJSON());
    },
  }, [collab?.doc]);
  const editorRef = useRef(editor);
  useEffect(() => {
    editorRef.current = editor;
  });

  // The sheet reopens on a different task without remounting this component — sync the content in.
  useEffect(() => {
    // In a live room the shared doc is the truth; pushing a refetched copy in would fight everyone's typing.
    if (!editor || collab || (editor.isFocused && !readOnly)) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(content);
    if (current !== next) editor.commands.setContent(content);
  }, [editor, content, collab, readOnly]);

  // An empty room is filled from D1 by one editor only — the one the room grants — or two first arrivals would both insert it.
  useEffect(() => {
    if (!editor || !collab) return;
    const { provider } = collab;
    const onSynced = (synced: boolean) => {
      if (synced && editor.isEmpty) provider.sendMessage(SEED_REQUEST);
    };
    const onMessage = (message: string) => {
      if (message === SEED_GRANTED && editor.isEmpty) editor.commands.setContent(content);
    };
    provider.on("sync", onSynced);
    provider.on("custom-message", onMessage);
    if (provider.synced) onSynced(true);
    return () => {
      provider.off("sync", onSynced);
      provider.off("custom-message", onMessage);
    };
  }, [editor, collab, content]);

  // A chip saved a name at the moment of tagging; show the person's current one. After the sync above, which would bring the old label back.
  useEffect(() => {
    if (editor && members.length) refreshMentionLabels(editor, members);
  }, [editor, content, members]);

  useEffect(() => {
    if (editor) setMentionMembers(editor, members);
  }, [editor, members]);

  if (!editor) return null;

  if (readOnly) return <EditorContent editor={editor} className={className} />;

  return (
    <>
      <EditorContent editor={editor} className={className} />
      {toolbar && (
        <div className="flex items-center justify-between gap-2">
          <EditorToolbar editor={editor} onUploadImage={onUploadImage} onDeleteImage={onDeleteImage} />
          {footer}
        </div>
      )}
      <RichTextBubbleMenu editor={editor} />
      <BlockHandle editor={editor} />
      {mentions.ui}
      {slash.ui}
    </>
  );
}
