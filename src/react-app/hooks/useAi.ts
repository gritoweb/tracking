import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toastApiError } from "@/lib/toastApiError";
import type { AiQuickEntryRequest, AiQuickEntryResult, AiSummaryRequest, AiSummaryResult } from "@shared/schemas";

export function useAiQuickEntry() {
  return useMutation({
    mutationFn: (body: AiQuickEntryRequest) =>
      api.ai.quickEntry(body as unknown as Record<string, unknown>) as Promise<AiQuickEntryResult>,
    onError: (error) => toastApiError(error, "Couldn't parse that — try rephrasing or enter it manually."),
  });
}

export function useAiSummary() {
  return useMutation({
    mutationFn: (body: AiSummaryRequest) =>
      api.ai.summary(body as unknown as Record<string, unknown>) as Promise<AiSummaryResult>,
    onError: (error) => toastApiError(error, "Couldn't generate a summary right now."),
  });
}
