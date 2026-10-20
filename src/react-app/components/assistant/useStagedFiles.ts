import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { attachmentProblem } from "@/lib/taskCommentAttachments";
import { toastApiError } from "@/lib/toastApiError";
import type { ComposerFile } from "./ai-elements/PromptInput";

type StagedFile = ComposerFile & { uploadId?: string };

const ATTACHED_HEADER = "\n\nAttached files (pass these as uploadIds):\n";

/** The message the model reads: the person's words, then each file's uploadId for the tools' `uploadIds`. */
export function withAttachedFiles(text: string, files: { name: string; uploadId?: string }[]): string {
  const ready = files.filter((f) => f.uploadId);
  if (!ready.length) return text;
  return `${text}${ATTACHED_HEADER}${ready.map((f) => `- ${f.name} (uploadId: ${f.uploadId})`).join("\n")}`;
}

/** A sent message as the person sees it: their words, and the attached files by name (the ids are for the model). */
export function splitAttachedFiles(message: string): { text: string; files: string[] } {
  const at = message.indexOf(ATTACHED_HEADER);
  if (at < 0) return { text: message, files: [] };
  const files = message
    .slice(at + ATTACHED_HEADER.length)
    .split("\n")
    .map((line) => line.match(/^- (.*) \(uploadId: [\w-]+\)$/)?.[1])
    .filter((name): name is string => Boolean(name));
  return { text: message.slice(0, at), files };
}

/** Files dropped, pasted or picked in the composer, each staged on the server as soon as it arrives. */
export function useStagedFiles() {
  const [files, setFiles] = useState<StagedFile[]>([]);

  const add = (picked: File[]) => {
    for (const file of picked) {
      const problem = attachmentProblem(file);
      if (problem) {
        toast.error(problem);
        continue;
      }
      const key = crypto.randomUUID();
      setFiles((all) => [...all, { key, name: file.name || "file", size: file.size, uploading: true }]);
      api.assistant
        .stageFile(file)
        .then(({ uploadId }) => setFiles((all) => all.map((f) => (f.key === key ? { ...f, uploading: false, uploadId } : f))))
        .catch((error) => {
          setFiles((all) => all.filter((f) => f.key !== key));
          toastApiError(error, `Failed to upload ${file.name}`);
        });
    }
  };

  const remove = (key: string) => setFiles((all) => all.filter((f) => f.key !== key));
  const clear = () => setFiles([]);
  return { files, add, remove, clear };
}
