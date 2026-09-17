import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { reportClientError } from "@/lib/errorReporter";

/** Shows the server's own `ApiError` message when there is one; `queued` is informational, not a failure. */
export function toastApiError(error: unknown, fallback: string): void {
  if (error instanceof ApiError && error.queued) {
    toast.info(error.message);
    return;
  }

  toast.error(error instanceof ApiError && error.message ? error.message : fallback);
  reportClientError(error, { kind: "api" });
}
