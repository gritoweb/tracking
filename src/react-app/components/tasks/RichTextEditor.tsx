import { useEffect, useRef, type ReactNode } from "react";
import { useEditor, EditorContent, type JSONContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extension-placeholder";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { setMentionMembers, useEditorMentions } from "./useEditorMentions";
import { dropHandleSlash, useEditorSlashCommands } from "./useEditorSlashCommands";
import { RichTextBubbleMenu } from "./RichTextBubbleMenu";
import { BlockHandle } from "./BlockHandle";
import { EditorToolbar } from "./EditorToolbar";
import { FileAttachmentNode } from "./FileAttachmentNode";
import { TaskImageNode } from "./TaskImageNode";
import { pickedFile, insertUploadedFile, UploadPlaceholderExtension, type InlineUpload } from "./editorUpload";
import { attachmentIdFromHref, useOpenAttachment } from "./attachment-viewer/AttachmentViewerContext";
import { refreshMentionLabels } from "@/lib/mentionLabels";
import { cn } from "@/lib/utils";
import { FILE_ATTACHMENT_NODE, attachmentIdsInDoc } from "@shared/rich-doc";
import { onAttachmentDeleted } from "@/lib/attachmentEvents";
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
  onUploadFile?: (file: File) => Promise<InlineUpload>;
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
  onUploadFile,
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
  // Files uploaded while this text was being written: one taken out again before it was saved is deleted, not left in Attachments.
  const sessionUploads = useRef(new Set<string>());
  const trackedUpload = onUploadFile
    ? async (file: File) => {
        const uploaded = await onUploadFile(file);
        sessionUploads.current.add(uploaded.id);
        return uploaded;
      }
    : undefined;
  const trackedUploadRef = useRef(trackedUpload);
  useEffect(() => {
    trackedUploadRef.current = trackedUpload;
  });
  const onDeleteRef = useRef(onDeleteImage);
  useEffect(() => {
    onDeleteRef.current = onDeleteImage;
  }, [onDeleteImage]);
  const sweepRemovedUploads = (doc: JSONContent) => {
    if (!sessionUploads.current.size) return;
    const shown = attachmentIdsInDoc(JSON.stringify(doc));
    for (const id of sessionUploads.current) {
      if (shown.has(id)) continue;
      sessionUploads.current.delete(id);
      onDeleteRef.current?.(id);
    }
  };
  // Read through a ref: the editor's handlers are built once, the viewer callback can change.
  const openAttachment = useOpenAttachment();
  const openAttachmentRef = useRef(openAttachment);
  useEffect(() => {
    openAttachmentRef.current = openAttachment;
  }, [openAttachment]);
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
      TaskImageNode,
      FileAttachmentNode,
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
          // An image or a link to one of the task's files opens the viewer (a link would otherwise download).
          const target = event.target as HTMLElement | null;
          const image = target?.tagName === "IMG" ? target.getAttribute("src") : null;
          const attachmentId = attachmentIdFromHref(image ?? target?.closest?.("a")?.getAttribute("href") ?? null);
          if (attachmentId && openAttachmentRef.current) {
            event.preventDefault();
            openAttachmentRef.current(attachmentId);
            return true;
          }
          return false;
        },
      },
      handlePaste: (view, event) => {
        const file = pickedFile(event.clipboardData?.items);
        const upload = trackedUploadRef.current;
        if (!file || !upload) return false;
        event.preventDefault();
        insertUploadedFile(view, view.state.selection.from, file, upload, onDeleteImage);
        return true;
      },
      handleDrop: (view, event) => {
        const file = pickedFile(event.dataTransfer?.files);
        const upload = trackedUploadRef.current;
        if (!file || !upload) return false;
        event.preventDefault();
        const pos =
          view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? view.state.selection.from;
        insertUploadedFile(view, pos, file, upload, onDeleteImage);
        return true;
      },
    },
    onBlur: ({ editor: e }) => {
      // A "/" the "+" handle left behind must not be saved as text.
      dropHandleSlash(e);
      sweepRemovedUploads(e.getJSON());
      onBlur?.(e.getJSON());
    },
  }, [collab?.doc]);
  const editorRef = useRef(editor);
  useEffect(() => {
    editorRef.current = editor;
  });

  // Leaving without saving (a comment never posted, the task closed): what this session uploaded and the text no longer shows goes.
  const sweepRef = useRef(sweepRemovedUploads);
  useEffect(() => {
    sweepRef.current = sweepRemovedUploads;
  });
  useEffect(
    () => () => {
      const doc = editorRef.current?.state.doc.toJSON() as JSONContent | undefined;
      if (doc) sweepRef.current(doc);
    },
    []
  );

  // A file deleted from Attachments leaves this text at once; in a live room the change reaches everyone through it.
  useEffect(() => {
    if (!editor) return;
    return onAttachmentDeleted((attachmentId) => {
      sessionUploads.current.delete(attachmentId);
      const url = `/api/attachments/${attachmentId}`;
      const ranges: { from: number; to: number }[] = [];
      editor.state.doc.descendants((node, pos) => {
        const shown = node.type.name === "image" ? node.attrs.src : node.type.name === FILE_ATTACHMENT_NODE ? node.attrs.href : null;
        if (shown === url) ranges.push({ from: pos, to: pos + node.nodeSize });
      });
      if (!ranges.length) return;
      const tr = editor.state.tr;
      for (const range of ranges.reverse()) tr.delete(range.from, range.to);
      editor.view.dispatch(tr);
    });
  }, [editor]);

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
          <EditorToolbar editor={editor} onUploadFile={trackedUpload} onDeleteImage={onDeleteImage} />
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
