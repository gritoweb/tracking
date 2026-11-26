import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { toastApiError } from "@/lib/toastApiError";
import type { CreateInvoice, Invoice, UpdateInvoice } from "@shared/schemas";

export function useClientInvoices(clientId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["invoices", clientId],
    queryFn: () => api.invoices.list(clientId as string),
    enabled: !!clientId && enabled,
  });
}

export function useInvoice(id: string | undefined) {
  return useQuery({ queryKey: ["invoices", "one", id], queryFn: () => api.invoices.get(id as string), enabled: !!id });
}

export function useSaveInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (change: { kind: "create"; data: CreateInvoice } | { kind: "update"; id: string; data: UpdateInvoice }): Promise<Invoice> =>
      change.kind === "create" ? api.invoices.create(change.data) : api.invoices.update(change.id, change.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      // Saving records the invoice number and due days the next invoice is offered.
      queryClient.invalidateQueries({ queryKey: ["report-settings"] });
    },
    onError: (error) => toastApiError(error, "Failed to save the invoice"),
  });
}

export function useDeleteInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.invoices.delete(id),
    onSuccess: (_, id) => {
      // Dropped first, so an open editor or viewer doesn't refetch an invoice that is gone.
      queryClient.removeQueries({ queryKey: ["invoices", "one", id] });
      return queryClient.invalidateQueries({ queryKey: ["invoices"], exact: false, predicate: (q) => q.queryKey[1] !== "one" });
    },
    onError: (error) => toastApiError(error, "Failed to delete the invoice"),
  });
}
