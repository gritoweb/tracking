import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { ReportFilters } from "@/components/reports/report-filters";
import type { Rounding, GroupDimension, SubGroupDimension } from "@/hooks/useReports";

// The full report view captured by a saved report.
export interface ReportConfig {
  range: { since: string; until: string; label: string };
  filters: ReportFilters;
  rounding: Rounding;
  group: GroupDimension;
  subGroup: SubGroupDimension;
  /** Keeps a client-facing report free of money when it's reopened next month. */
  hideAmounts?: boolean;
}

export interface SavedReport {
  id: string;
  name: string;
  config: ReportConfig;
  createdAt: string;
  updatedAt: string;
}

export function useSavedReports() {
  return useQuery({
    queryKey: ["saved-reports"],
    queryFn: () => api.savedReports.list() as Promise<SavedReport[]>,
    staleTime: 5 * 60_000,
  });
}

export function useCreateSavedReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; config: ReportConfig }) =>
      api.savedReports.create(
        body as unknown as { name: string; config: Record<string, unknown> }
      ) as Promise<SavedReport>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-reports"] });
      toast.success("Report saved");
    },
    onError: () => toast.error("Failed to save report"),
  });
}

export function useDeleteSavedReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.savedReports.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-reports"] });
      toast.success("Report deleted");
    },
    onError: () => toast.error("Failed to delete report"),
  });
}
