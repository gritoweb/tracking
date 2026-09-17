import { describe, expect, it, vi } from "vitest";
import { createD1Stub } from "../../test/d1-stub";
import { inferProjectForTitle } from "./projects";

function stubDbWithProject() {
  return createD1Stub({
    all: () => ({
      results: [
        { project_id: "project-1", project_name: "Acme", project_billable: 1, task_id: null, task_name: null },
      ],
    }),
  }).db;
}

describe("inferProjectForTitle (ERR-4: shared by assistant-tools.ts and routes/assistant.ts)", () => {
  it("resolves the matched project on a successful AI call", async () => {
    const ai = { run: vi.fn().mockResolvedValue({ assignments: [{ title: "Acme sync", projectName: "Acme" }] }) };
    const result = await inferProjectForTitle(stubDbWithProject(), ai as unknown as Ai, "workspace-A", "Acme sync");
    expect(result).toEqual({ projectId: "project-1", projectName: "Acme" });
  });

  it("returns null when the model finds no match", async () => {
    const ai = { run: vi.fn().mockResolvedValue({ assignments: [{ title: "1:1", projectName: null }] }) };
    const result = await inferProjectForTitle(stubDbWithProject(), ai as unknown as Ai, "workspace-A", "1:1");
    expect(result).toBeNull();
  });

  it("logs and returns null (never throws) when the AI call fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ai = { run: vi.fn().mockRejectedValue(new Error("AI unavailable")) };
    const result = await inferProjectForTitle(stubDbWithProject(), ai as unknown as Ai, "workspace-A", "Acme sync");
    expect(result).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      "ai: event-project inference call failed",
      expect.objectContaining({ workspaceId: "workspace-A" })
    );
    warn.mockRestore();
  });
});
