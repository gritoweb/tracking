import { describe, expect, it, vi } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { routeClient } from "../../test/route-harness";

// tasks.ts imports lib/image.ts, which loads a real WASM module outside vitest — stub it out (same as tasks.test.ts).
vi.mock("@cf-wasm/photon/workerd", () => ({
  PhotonImage: class {},
  SamplingFilter: { Lanczos3: 1 },
  resize: vi.fn(),
}));

const { tasksRouter } = await import("./tasks");

/** ws-A: owner u-owner, member u-member (author of t-mine), admin u-admin. ws-B holds t-foreign. */
function archivingWorld() {
  const { db, raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A'), ('ws-B', 'B');
    INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES
      ('u-owner', 'Owner', 'o@x.test', '${now}', '${now}'),
      ('u-admin', 'Admin', 'a@x.test', '${now}', '${now}'),
      ('u-member', 'Member', 'm@x.test', '${now}', '${now}');
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES
      ('m-owner', 'ws-A', 'u-owner', 'owner', '${now}'),
      ('m-admin', 'ws-A', 'u-admin', 'admin', '${now}'),
      ('m-member', 'ws-A', 'u-member', 'member', '${now}');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl-A', 'ws-A', 'Client A'), ('cl-B', 'ws-B', 'Client B');
    INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p-A', 'ws-A', 'Project A', 'cl-A'), ('p-B', 'ws-B', 'Project B', 'cl-B');
    INSERT INTO task_statuses (id, workspace_id, project_id, name, color, category, sort_order, is_default) VALUES
      ('s-todo', 'ws-A', NULL, 'To do', '#3b82f6', 'not_started', 1, 1),
      ('s-done', 'ws-A', NULL, 'Done', '#22c55e', 'completed', 2, 0),
      ('s-todo-B', 'ws-B', NULL, 'To do', '#3b82f6', 'not_started', 1, 1);
    INSERT INTO tasks (id, workspace_id, project_id, name, status_id, created_by, parent_id) VALUES
      ('t-owner', 'ws-A', 'p-A', 'Owner task', 's-todo', 'u-owner', NULL),
      ('t-owner-sub', 'ws-A', 'p-A', 'Owner subtask', 's-todo', 'u-owner', 't-owner'),
      ('t-mine', 'ws-A', 'p-A', 'Member task', 's-todo', 'u-member', NULL),
      ('t-foreign', 'ws-B', 'p-B', 'Foreign task', 's-todo-B', NULL, NULL);
  `);
  const as = (userId: string) => routeClient(tasksRouter, db, { workspaceId: "ws-A", userId });
  const archivedAt = (id: string) =>
    (raw.prepare(`SELECT archived_at FROM tasks WHERE id = ?`).get(id) as { archived_at: string | null } | undefined)?.archived_at;
  return { db, raw, as, archivedAt };
}

async function ids(res: Response): Promise<string[]> {
  return ((await res.json()) as Array<{ id: string }>).map((t) => t.id).sort();
}

describe("task archiving — listing", () => {
  it("hides archived tasks unless includeArchived is asked for", async () => {
    const { raw, as } = archivingWorld();
    raw.exec(`UPDATE tasks SET archived_at = '2026-02-01T00:00:00.000Z' WHERE id IN ('t-owner', 't-owner-sub')`);
    const owner = as("u-owner");

    expect(await ids(await owner.get("/?includeInactive=true"))).toEqual(["t-mine"]);
    const all = await owner.get("/?includeInactive=true&includeArchived=true");
    const body = (await all.json()) as Array<{ id: string; archivedAt: string | null }>;
    expect(body.map((t) => t.id).sort()).toEqual(["t-mine", "t-owner", "t-owner-sub"]);
    expect(body.find((t) => t.id === "t-owner")?.archivedAt).toBe("2026-02-01T00:00:00.000Z");
  });

  it("still opens an archived task by id", async () => {
    const { raw, as } = archivingWorld();
    raw.exec(`UPDATE tasks SET archived_at = '2026-02-01T00:00:00.000Z' WHERE id = 't-owner'`);
    expect((await as("u-owner").get("/t-owner")).status).toBe(200);
  });
});
