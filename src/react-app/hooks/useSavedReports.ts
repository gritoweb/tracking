import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { toastApiError } from "@/lib/toastApiError";
import { GroupDimensionSchema, SubGroupDimensionSchema } from "@shared/schemas";

// The wire `config` is untyped JSON (SavedReportSchema); proven into this app's own shape by parsing it.
const ReportFiltersSchema = z.object({
  clientIds: z.array(z.string()),
  projectIds: z.array(z.string()),
  taskIds: z.array(z.string()),
  tagIds: z.array(z.string()),
  userIds: z.array(z.string()),
  billable: z.enum(["all", "billable", "nonbillable"]),
  search: z.string(),
});

const ReportConfigSchema = z.object({
  range: z.object({ since: z.string(), until: z.string(), label: z.string() }),
  filters: ReportFiltersSchema,
  rounding: z.object({
    mode: z.enum(["off", "nearest", "up", "down"]),
    minutes: z.number(),
  }),
  group: GroupDimensionSchema,
  subGroup: SubGroupDimensionSchema,
  /** Keeps a client-facing report free of money when it's reopened next month. */
  hideAmounts: z.boolean().optional(),
});

export type ReportConfig = z.infer<typeof ReportConfigSchema>;

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
    queryFn: async (): Promise<SavedReport[]> => {
      const rows = await api.savedReports.list();
      return rows.map((r) => ({ ...r, config: ReportConfigSchema.parse(r.config) }));
    },
    staleTime: 5 * 60_000,
  });
}

export function useCreateSavedReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: { name: string; config: ReportConfig }): Promise<SavedReport> => {
      // Fresh literal spread satisfies the wire's Record<string, unknown> without a cast.
      const row = await api.savedReports.create({ ...body, config: { ...body.config } });
      return { ...row, config: ReportConfigSchema.parse(row.config) };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["saved-reports"] });
      toast.success("Report saved");
    },
    onError: (error) => toastApiError(error, "Failed to save report"),
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
    onError: (error) => toastApiError(error, "Failed to delete report"),
  });
}
