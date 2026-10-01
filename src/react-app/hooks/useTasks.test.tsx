// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Task, TaskStatus } from "@shared/schemas";
import { useMoveTask, useUpdateTask } from "./useTasks";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/toastApiError", () => ({ toastApiError: vi.fn() }));
vi.mock("@/lib/api-client", () => ({
  api: { tasks: { move: vi.fn(() => new Promise(() => {})), update: vi.fn(() => new Promise(() => {})) } },
}));

const task = { id: "t1", parentId: null, statusId: "s1", boardOrder: 1, active: true, completedAt: null, name: "Draft" } as unknown as Task;
const status = { id: "s2", name: "Doing", color: "#000000", category: "active" } as unknown as TaskStatus;

// "Show archived" leaves non-list entries under the ["tasks"] prefix (counts object, a single task).
function setup<T>(hook: () => T) {
  const queryClient = new QueryClient();
  queryClient.setQueryData(["tasks", "all", "withDone"], [task]);
  queryClient.setQueryData(["tasks", "archive-counts", "all"], { total: 0, byStatus: {} });
  queryClient.setQueryData(["tasks", "one", "t1"], task);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, ...renderHook(hook, { wrapper }) };
}

describe("task cache patches", () => {
  it("moves a card after Show archived cached its counts", async () => {
    const { queryClient, result } = setup(useMoveTask);
    await act(async () => {
      result.current.mutate({ id: "t1", status, boardOrder: 2 });
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.error).toBeNull();
    expect(queryClient.getQueryData<Task[]>(["tasks", "all", "withDone"])?.[0]).toMatchObject({ statusId: "s2", boardOrder: 2 });
    expect(queryClient.getQueryData(["tasks", "archive-counts", "all"])).toEqual({ total: 0, byStatus: {} });
  });

  it("updates a task after Show archived cached its counts", async () => {
    const { queryClient, result } = setup(useUpdateTask);
    await act(async () => {
      result.current.mutate({ id: "t1", data: { name: "Final" } });
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current.error).toBeNull();
    expect(queryClient.getQueryData<Task[]>(["tasks", "all", "withDone"])?.[0]).toMatchObject({ name: "Final" });
  });
});
