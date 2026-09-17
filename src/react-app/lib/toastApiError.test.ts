// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { reportClientError } from "@/lib/errorReporter";
import { toastApiError } from "@/lib/toastApiError";

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/lib/errorReporter", () => ({
  reportClientError: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("toastApiError", () => {
  it("shows the server's own message for an ApiError and reports it", () => {
    const error = new ApiError("Only the author can edit this comment", 403);
    toastApiError(error, "Failed to update");

    expect(toast.error).toHaveBeenCalledWith("Only the author can edit this comment");
    expect(reportClientError).toHaveBeenCalledWith(error, { kind: "api" });
  });

  it("treats the queued offline case as informational, not a failure, and never reports it", () => {
    const error = new ApiError("Offline — saved locally, will sync when you reconnect", 0, true);
    toastApiError(error, "Failed to update");

    expect(toast.info).toHaveBeenCalledWith("Offline — saved locally, will sync when you reconnect");
    expect(toast.error).not.toHaveBeenCalled();
    expect(reportClientError).not.toHaveBeenCalled();
  });

  it("falls back to the caller's message and still reports an unknown error", () => {
    const error = new TypeError("Failed to fetch");
    toastApiError(error, "Failed to update");

    expect(toast.error).toHaveBeenCalledWith("Failed to update");
    expect(reportClientError).toHaveBeenCalledWith(error, { kind: "api" });
  });
});
