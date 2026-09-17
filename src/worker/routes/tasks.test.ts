import { describe, expect, it, vi } from "vitest";
import { createD1Stub } from "../../test/d1-stub";

// tasks.ts imports lib/image.ts, which loads a real WASM module outside vitest — stub it out (same as image.test.ts).
vi.mock("@cf-wasm/photon/workerd", () => ({
  PhotonImage: class {},
  SamplingFilter: { Lanczos3: 1 },
  resize: vi.fn(),
}));

const { taskAndSubtaskIds } = await import("./tasks");

describe("taskAndSubtaskIds (P0-2)", () => {
  it("returns the task and every one of its subtasks, not just the first", async () => {
    // SQLite's `IN (a, (SELECT …))` is scalar — it only matched "P,S1" for subtasks S1/S2/S3.
    const { db, calls } = createD1Stub({
      all: () => ({ results: [{ id: "P" }, { id: "S1" }, { id: "S2" }, { id: "S3" }] }),
    });
    const ids = await taskAndSubtaskIds(db, "workspace-1", "P");
    expect(ids).toEqual(["P", "S1", "S2", "S3"]);
    expect(calls[0]?.params).toEqual(["workspace-1", "P", "P"]);
  });

  it("returns just the task itself when it has no subtasks", async () => {
    const { db } = createD1Stub({ all: () => ({ results: [{ id: "P" }] }) });
    expect(await taskAndSubtaskIds(db, "workspace-1", "P")).toEqual(["P"]);
  });
});
