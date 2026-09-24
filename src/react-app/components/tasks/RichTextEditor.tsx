import { useEffect } from "react";
import { useEditor, EditorContent, Extension, type JSONContent } from "@tiptap/react";
import { StarterKit } from "@tiptap/starter-kit";
import { TaskList } from "@tiptap/extension-task-list";
import { TaskItem } from "@tiptap/extension-task-item";
import { Placeholder } from "@tiptap/extension-placeholder";
import { Image } from "@tiptap/extension-image";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { Plugin, PluginKey, type EditorState } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { setMentionMembers, useEditorMentions } from "./useEditorMentions";
import { dropHandleSlash, useEditorSlashCommands } from "./useEditorSlashCommands";
import { RichTextBubbleMenu } from "./RichTextBubbleMenu";
import { BlockHandle } from "./BlockHandle";
import { refreshMentionLabels } from "@/lib/mentionLabels";
import { cn } from "@/lib/utils";
import { getContrastColor } from "@/lib/colorUtils";
import { NEUTRAL_SWATCH } from "@shared/colors";
import type { WorkspaceMember } from "@/hooks/useWorkspaceRole";
import { toastApiError } from "@/lib/toastApiError";
import { Collaboration } from "@tiptap/extension-collaboration";
import { CollaborationCaret } from "@tiptap/extension-collaboration-caret";
import type { DescriptionCollab } from "@/hooks/useDescriptionCollab";
import { DESCRIPTION_FIELD, SEED_GRANTED, SEED_REQUEST } from "@shared/description-collab";

/** Shown on the empty line the caret sits on, so a blank line says what it's for. */
const LINE_HINT = "Write, or type / for commands";

interface RichTextEditorProps {
  content: JSONContent;
  onBlur: (doc: JSONContent) => void;
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

function imageFile(items: DataTransferItemList | FileList | null | undefined): File | null {
  if (!items) return null;
  for (const item of items) {
    const file = "getAsFile" in item ? item.getAsFile() : (item as File);
    if (file?.type.startsWith("image/")) return file;
  }
  return null;
}

interface PlaceholderSpec {
  id: string;
}

type PlaceholderAction = { add: { id: string; pos: number } } | { remove: { id: string } };

const uploadPlaceholderKey = new PluginKey<DecorationSet>("upload-placeholder");

function placeholderDOM(): HTMLElement {
  const span = document.createElement("span");
  span.textContent = "Uploading image…";
  span.style.opacity = "0.6";
  span.style.fontStyle = "italic";
  return span;
}

/** Tracks in-flight uploads as widget decorations mapped through every transaction, so an insert lands wherever the spot ended up rather than the position captured at upload time. */
function uploadPlaceholderPlugin() {
  return new Plugin<DecorationSet>({
    key: uploadPlaceholderKey,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, set) {
        set = set.map(tr.mapping, tr.doc);
        const action = tr.getMeta(uploadPlaceholderKey) as PlaceholderAction | undefined;
        if (action && "add" in action) {
          set = set.add(tr.doc, [
            Decoration.widget(action.add.pos, placeholderDOM, { id: action.add.id }),
          ]);
        } else if (action && "remove" in action) {
          const stale = set.find(undefined, undefined, (spec: PlaceholderSpec) => spec.id === action.remove.id);
          set = set.remove(stale);
        }
        return set;
      },
    },
    props: {
      decorations: (state) => uploadPlaceholderKey.getState(state),
    },
  });
}

const UploadPlaceholderExtension = Extension.create({
  name: "uploadPlaceholder",
  addProseMirrorPlugins() {
    return [uploadPlaceholderPlugin()];
  },
});

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

function findPlaceholderPos(state: EditorState, id: string): number | null {
  const set = uploadPlaceholderKey.getState(state);
  const found = set?.find(undefined, undefined, (spec: PlaceholderSpec) => spec.id === id)?.[0];
  return found ? found.from : null;
}

/** Reserves `pos` with a placeholder immediately, then resolves the upload against wherever that spot mapped to — never the position captured at drop/paste time. */
function insertUploadedImage(
  view: EditorView,
  pos: number,
  file: File,
  onUploadImage: (file: File) => Promise<{ url: string; id: string }>,
  onDeleteImage: ((id: string) => void) | undefined
) {
  const id = crypto.randomUUID();
  view.dispatch(view.state.tr.setMeta(uploadPlaceholderKey, { add: { id, pos } } satisfies PlaceholderAction));

  onUploadImage(file)
    .then(({ url, id: attachmentId }) => {
      const mappedPos = findPlaceholderPos(view.state, id);
      const tr = view.state.tr.setMeta(uploadPlaceholderKey, { remove: { id } } satisfies PlaceholderAction);
      if (mappedPos === null) {
        // The upload already succeeded but its target text is gone — insert nowhere, clean up instead.
        view.dispatch(tr);
        onDeleteImage?.(attachmentId);
        toastApiError(
          new Error("Upload target position was removed before it finished"),
          "Image uploaded but its spot in the text was deleted — removed"
        );
        return;
      }
      view.dispatch(tr.insert(mappedPos, view.state.schema.nodes.image.create({ src: url })));
    })
    .catch(() => {
      // The upload itself already reported its own error (type/size checks or the mutation's own toast).
      view.dispatch(view.state.tr.setMeta(uploadPlaceholderKey, { remove: { id } } satisfies PlaceholderAction));
    });
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
}: RichTextEditorProps) {
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
    editorProps: {
      attributes: {
        role: "textbox",
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        class: cn("tt-richtext min-h-16 px-0 py-0", "focus:outline-none", editorClassName),
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
      onBlur(e.getJSON());
    },
  }, [collab?.doc]);

  // The sheet reopens on a different task without remounting this component — sync the content in.
  useEffect(() => {
    // In a live room the shared doc is the truth; pushing a refetched copy in would fight everyone's typing.
    if (!editor || collab || editor.isFocused) return;
    const current = JSON.stringify(editor.getJSON());
    const next = JSON.stringify(content);
    if (current !== next) editor.commands.setContent(content);
  }, [editor, content, collab]);

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

  return (
    <>
      <EditorContent editor={editor} className={className} />
      <RichTextBubbleMenu editor={editor} />
      <BlockHandle editor={editor} />
      {mentions.ui}
      {slash.ui}
    </>
  );
}
