// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installUnhandledRejectionReporter, reportClientError } from "@/lib/errorReporter";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("reportClientError", () => {
  it("posts the error's message, stack and kind to the client-errors endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    reportClientError(new Error("boom"), { kind: "boundary" });
    await Promise.resolve(); // let the fire-and-forget fetch's microtask run

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/client-errors",
      expect.objectContaining({ method: "POST" })
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({ message: "boom", kind: "boundary" });
    expect(typeof body.stack).toBe("string");
  });

  it("stringifies a non-Error value rather than throwing", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    expect(() => reportClientError("plain string reason", { kind: "unhandledrejection" })).not.toThrow();
    await Promise.resolve();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.message).toBe("plain string reason");
    expect(body.stack).toBeUndefined();
  });

  it("never throws and never loops when the report itself fails to send", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    const unhandled = vi.fn();
    window.addEventListener("unhandledrejection", unhandled);

    expect(() => reportClientError(new Error("boom"), { kind: "api" })).not.toThrow();
    // Give the rejected fetch promise's own .catch a turn to run.
    await new Promise((r) => setTimeout(r, 0));

    expect(unhandled).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    window.removeEventListener("unhandledrejection", unhandled);
  });
});

describe("installUnhandledRejectionReporter", () => {
  it("reports a real unhandledrejection event with its kind", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    installUnhandledRejectionReporter();

    const event = new Event("unhandledrejection") as PromiseRejectionEvent;
    Object.defineProperty(event, "reason", { value: new Error("rejected") });
    window.dispatchEvent(event);
    await Promise.resolve();

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body).toMatchObject({ message: "rejected", kind: "unhandledrejection" });
  });
});
