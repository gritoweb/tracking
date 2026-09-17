import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { toastApiError } from "@/lib/toastApiError";
import type { AiQuickEntryRequest, AiSummaryRequest } from "@shared/schemas";

export function useAiQuickEntry() {
  return useMutation({
    mutationFn: (body: AiQuickEntryRequest) => api.ai.quickEntry(body),
    onError: (error) => toastApiError(error, "Couldn't parse that — try rephrasing or enter it manually."),
  });
}

export function useAiSummary() {
  return useMutation({
    mutationFn: (body: AiSummaryRequest) => api.ai.summary(body),
    onError: (error) => toastApiError(error, "Couldn't generate a summary right now."),
  });
}
