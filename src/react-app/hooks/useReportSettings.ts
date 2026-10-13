import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { toastApiError } from "@/lib/toastApiError";
import type { ReportSettings, UpdateReportSettings } from "@shared/schemas";

const KEY = ["report-settings"];

export function useReportSettings() {
  return useQuery({ queryKey: KEY, queryFn: () => api.reportSettings.get(), staleTime: 5 * 60_000 });
}

export function useUpdateReportSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (
      change: { kind: "fields"; data: UpdateReportSettings } | { kind: "logo"; file: File } | { kind: "removeLogo" }
    ): Promise<ReportSettings> =>
      change.kind === "fields"
        ? api.reportSettings.update(change.data)
        : change.kind === "logo"
          ? api.reportSettings.uploadLogo(change.file)
          : api.reportSettings.deleteLogo(),
    onSuccess: (data) => {
      queryClient.setQueryData(KEY, data);
      toast.success("Report settings saved");
    },
    onError: (error) => toastApiError(error, "Failed to save report settings"),
  });
}
