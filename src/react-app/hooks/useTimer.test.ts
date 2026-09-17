// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { Task, TimeEntry } from "@shared/schemas";
import { offerTaskDone } from "./useTimer";

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), warning: vi.fn(), success: vi.fn() }),
}));

const list = vi.fn();
vi.mock("@/lib/api-client", () => ({
  api: { tasks: { list: (...args: unknown[]) => list(...args) } },
}));

function makeEntry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: "e1",
    workspaceId: "w1",
    userId: "u1",
    userName: null,
    userEmail: null,
    userImage: null,
    description: "",
    projectId: "p1",
    projectName: null,
    projectColor: null,
    clientName: null,
    taskId: "t1",
    taskName: null,
    start: new Date().toISOString(),
    stop: new Date().toISOString(),
    duration: 3600,
    billable: true,
    tags: [],
    syncStatus: null,
    externalId: null,
    syncedAt: null,
    syncError: null,
    calendarEventId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    workspaceId: "w1",
    projectId: "p1",
    projectName: null,
    projectColor: null,
    name: "Cutover plan",
    description: null,
    active: true,
    statusId: "s1",
    statusName: "To do",
    statusColor: "#000",
    statusCategory: "not_started",
    estimatedSeconds: null,
    trackedSeconds: 0,
    dueDate: null,
    priority: 4,
    sortOrder: 0,
    boardOrder: 0,
    parentId: null,
    completedAt: null,
    recurRule: null,
    subtaskTotal: 0,
    subtaskDone: 0,
    assignees: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("offerTaskDone", () => {
  it("fetches the task list rather than trusting whatever is already cached", async () => {
    const queryClient = new QueryClient();
    // The cache holds nothing yet (as it would mid-invalidation) — a stale read would bail out here.
    list.mockResolvedValue([makeTask({ dueDate: "2020-01-01" })]);

    await offerTaskDone(queryClient, makeEntry());

    expect(list).toHaveBeenCalledWith({ includeInactive: "true" });
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("reuses a fresh cache entry instead of refetching", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(["tasks", "all", "withDone"], [makeTask({ dueDate: "2020-01-01" })]);

    await offerTaskDone(queryClient, makeEntry());

    expect(list).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("does nothing for an entry with no task", async () => {
    const queryClient = new QueryClient();

    await offerTaskDone(queryClient, makeEntry({ taskId: null }));

    expect(list).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("stays quiet when the task carries neither a met estimate nor a past-due date", async () => {
    const queryClient = new QueryClient();
    list.mockResolvedValue([makeTask({ dueDate: null, estimatedSeconds: null })]);

    await offerTaskDone(queryClient, makeEntry());

    expect(toast).not.toHaveBeenCalled();
  });

  it("stays quiet for an already-inactive task", async () => {
    const queryClient = new QueryClient();
    list.mockResolvedValue([makeTask({ active: false, dueDate: "2020-01-01" })]);

    await offerTaskDone(queryClient, makeEntry());

    expect(toast).not.toHaveBeenCalled();
  });

  it("does not throw when the fetch fails — this is a best-effort nudge, not a critical path", async () => {
    const queryClient = new QueryClient();
    list.mockRejectedValue(new Error("network down"));

    await expect(offerTaskDone(queryClient, makeEntry())).resolves.toBeUndefined();
    expect(toast).not.toHaveBeenCalled();
  });
});
