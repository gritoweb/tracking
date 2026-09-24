import { toast } from "sonner";
import { imageProblem } from "@/lib/taskCommentAttachments";
import { useDeleteTaskAttachment, useUploadTaskAttachment } from "@/hooks/useTasks";

/** An image into a task's rich text (description or comment): checked, uploaded, and the orphan cleanup the editor needs. */
export function useTaskImageUpload(taskId: string | null) {
  const upload = useUploadTaskAttachment();
  const remove = useDeleteTaskAttachment();

  const uploadImage = async (file: File): Promise<{ url: string; id: string }> => {
    const problem = imageProblem(file);
    if (problem) {
      toast.error(problem);
      throw new Error(problem);
    }
    if (!taskId) throw new Error("No task to attach the image to");
    const attachment = await upload.mutateAsync({ taskId, file });
    return { url: attachment.url, id: attachment.id };
  };

  // Only when an upload's insertion spot vanished mid-flight, leaving an orphan in R2.
  const deleteOrphanedImage = (id: string) => {
    if (taskId) remove.mutate({ taskId, id });
  };

  return { uploadImage, deleteOrphanedImage };
}
