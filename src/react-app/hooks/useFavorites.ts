import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { toastApiError } from "@/lib/toastApiError";
import type { CreateFavorite } from "@shared/schemas";

export function useFavorites() {
  return useQuery({
    queryKey: ["favorites"],
    queryFn: () => api.favorites.list(),
    staleTime: 5 * 60_000,
  });
}

export function useCreateFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateFavorite) => api.favorites.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      toast.success("Saved to favorites");
    },
    onError: (error) => toastApiError(error, "Failed to save favorite"),
  });
}

export function useDeleteFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.favorites.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["favorites"] });
      toast.success("Removed favorite");
    },
    onError: (error) => toastApiError(error, "Failed to remove favorite"),
  });
}
