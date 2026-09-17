import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { toastApiError } from "@/lib/toastApiError";
import type {
  CreateProject,
  UpdateProject,
  CreateClient,
  UpdateClient,
} from "@shared/schemas";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: () => api.projects.list(),
    staleTime: 5 * 60_000,
  });
}

/**
 * `range` scopes each project's `trackedSeconds` to a window. `budgetSeconds`
 * stays all-time regardless, because the budget bar is cumulative — see
 * routes/projects.ts. Omit it for the all-time list.
 */
export function useAllProjects(range?: { since: string; until: string }) {
  return useQuery({
    queryKey: ["projects", "all", range?.since ?? null, range?.until ?? null],
    queryFn: () =>
      api.projects.list({
        includeArchived: "true",
        ...(range ? { since: range.since, until: range.until } : {}),
      }),
    staleTime: 5 * 60_000,
  });
}

/**
 * Budget pacing for the active projects: share of budget spent, burn rate, and
 * whether the current rate overruns before the end date.
 *
 * Separate from `useProjects` on purpose — the pacing query carries a
 * trailing-window aggregate the plain project list has no use for, and the
 * project list is on the hot path for every picker in the app.
 */
export function useProjectPacing() {
  return useQuery({
    queryKey: ["projects", "pacing"],
    queryFn: () => api.projects.pacing(),
    staleTime: 5 * 60_000,
  });
}

export function useCreateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProject) => api.projects.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project created");
    },
    onError: (error) => toastApiError(error, "Failed to create project"),
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateProject }) =>
      api.projects.update(id, data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
    onError: (error) => toastApiError(error, "Failed to update project"),
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project archived");
    },
    onError: (error) => toastApiError(error, "Failed to archive project"),
  });
}

// Assign distinct palette colors across all projects (AI-assisted, server-side).
export function useRecolorProjects() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.projects.recolor(),
    onSuccess: ({ recolored, usedAI }) => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["time-entries"] });
      queryClient.invalidateQueries({ queryKey: ["reports"] });
      toast.success(
        recolored > 0
          ? `Recolored ${recolored} ${recolored === 1 ? "project" : "projects"}${usedAI ? " with AI" : ""}`
          : "No projects to recolor"
      );
    },
    onError: (error) => toastApiError(error, "Failed to recolor projects"),
  });
}

export function useClients() {
  return useQuery({
    queryKey: ["clients"],
    queryFn: () => api.clients.list(),
    staleTime: 5 * 60_000,
  });
}

export function useAllClients() {
  return useQuery({
    queryKey: ["clients", "all"],
    queryFn: () => api.clients.list({ includeArchived: "true" }),
    staleTime: 5 * 60_000,
  });
}

export function useClient(id: string | undefined) {
  return useQuery({
    queryKey: ["clients", id],
    queryFn: () => api.clients.get(id as string),
    enabled: !!id,
  });
}

export function useCreateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateClient) => api.clients.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client created");
    },
    onError: (error) => toastApiError(error, "Failed to create client"),
  });
}

export function useUpdateClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateClient }) =>
      api.clients.update(id, data),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["clients"] }),
    onError: (error) => toastApiError(error, "Failed to update client"),
  });
}

export function useDeleteClient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.clients.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Client archived");
    },
    onError: (error) => toastApiError(error, "Failed to archive client"),
  });
}

export function useTags() {
  return useQuery({
    queryKey: ["tags"],
    queryFn: () => api.tags.list(),
    staleTime: 5 * 60_000,
  });
}

// name → color lookup for rendering tag swatches from an entry's tag names.
export function useTagColors() {
  const { data: tags = [] } = useTags();
  const map = new Map(tags.map((t) => [t.name, t.color]));
  return (name: string) => map.get(name) ?? "#64748b";
}

/** Creates the tag as soon as it's added, so its swatch is the real one rather than a guess. */
export function useCreateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.tags.create(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tags"] }),
    onError: (error) => toastApiError(error, "Failed to create tag"),
  });
}

export function useUpdateTag() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, color }: { id: string; color: string }) =>
      api.tags.update(id, { color }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tags"] }),
    onError: (error) => toastApiError(error, "Failed to update tag color"),
  });
}
