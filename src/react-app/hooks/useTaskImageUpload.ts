import { toast } from "sonner";
import type { InlineUpload } from "@/components/tasks/editorUpload";
import { attachmentProblem } from "@/lib/taskCommentAttachments";
import { isImageContentType } from "@shared/attachments";
import { useDeleteTaskAttachment, useUploadTaskAttachment } from "@/hooks/useTasks";

/** Files into a task: its Attachments section, its rich text (description or comment), and the orphan cleanup the editor needs. */
export function useTaskImageUpload(taskId: string | null) {
  const upload = useUploadTaskAttachment();
  const remove = useDeleteTaskAttachment();

  /** Any accepted file into the task's Attachments section (images and documents). */
  const uploadFile = async (file: File) => {
    const problem = attachmentProblem(file);
    if (problem) {
      toast.error(problem);
      throw new Error(problem);
    }
    if (!taskId) throw new Error("No task to attach the file to");
    return upload.mutateAsync({ taskId, file });
  };

  /** A file into a task's rich text: an image shows inline, any other accepted file becomes a link to it. */
  const uploadInline = async (file: File): Promise<InlineUpload> => {
    const attachment = await uploadFile(file);
    return { url: attachment.url, id: attachment.id, filename: attachment.filename, image: isImageContentType(attachment.contentType) };
  };

  // Only when an upload's insertion spot vanished mid-flight, leaving an orphan in R2.
  const deleteOrphanedImage = (id: string) => {
    if (taskId) remove.mutate({ taskId, id });
  };

  return { uploadInline, uploadFile, deleteOrphanedImage };
}
