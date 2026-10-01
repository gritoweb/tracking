// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installStaleChunkReload } from "./staleChunkReload";

function fakeWindow() {
  const target = new EventTarget();
  const reload = vi.fn();
  const win = Object.assign(target, { sessionStorage: window.sessionStorage, location: { reload } }) as unknown as Window;
  installStaleChunkReload(win);
  const fail = () => {
    const event = new Event("vite:preloadError", { cancelable: true });
    win.dispatchEvent(event);
    return event.defaultPrevented;
  };
  return { reload, fail };
}

describe("installStaleChunkReload", () => {
  afterEach(() => {
    sessionStorage.clear();
    vi.useRealTimers();
  });

  it("reloads once when a chunk from the previous deploy is gone", () => {
    const { reload, fail } = fakeWindow();
    expect(fail()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("lets a failure right after the reload surface instead of looping", () => {
    const { reload, fail } = fakeWindow();
    fail();
    expect(fail()).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads again for a later deploy", () => {
    vi.useFakeTimers();
    const { reload, fail } = fakeWindow();
    fail();
    vi.advanceTimersByTime(11_000);
    fail();
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
