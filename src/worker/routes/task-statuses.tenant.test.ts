import { describe, expect, it } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { routeClient } from "../../test/route-harness";
import { taskStatusesRouter } from "./task-statuses";

/** ws-A (owner u-owner) has p-A and three global statuses; ws-B has p-B. */
function world() {
  const { db, raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A'), ('ws-B', 'B');
    INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES ('u-owner', 'o', 'o@x.test', '${now}', '${now}');
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES ('m-owner', 'ws-A', 'u-owner', 'owner', '${now}');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl-A', 'ws-A', 'Client A'), ('cl-B', 'ws-B', 'Client B');
    INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p-A', 'ws-A', 'Project A', 'cl-A'), ('p-B', 'ws-B', 'Project B', 'cl-B');
    INSERT INTO task_statuses (id, workspace_id, project_id, name, color, category, sort_order, is_default) VALUES
      ('s-todo', 'ws-A', NULL, 'To do', '#3b82f6', 'not_started', 1, 1),
      ('s-doing', 'ws-A', NULL, 'Doing', '#f59e0b', 'active', 2, 0),
      ('s-done', 'ws-A', NULL, 'Done', '#22c55e', 'completed', 3, 0);
  `);
  const client = routeClient(taskStatusesRouter, db, { workspaceId: "ws-A", userId: "u-owner" });
  const rowsFor = (projectId: string) => raw.prepare(`SELECT id, workspace_id FROM task_statuses WHERE project_id = ?`).all(projectId);
  return { client, rowsFor };
}

describe("S-19 — status routes never bind another workspace's project", () => {
  it("POST /fork refuses a projectId from another workspace and clones nothing", async () => {
    const { client, rowsFor } = world();
    const res = await client.post("/fork", { projectId: "p-B" });
    expect(res.status).toBe(404);
    expect(rowsFor("p-B")).toEqual([]);
  });

  it("POST / refuses a projectId from another workspace and stores neither the fork nor the column", async () => {
    const { client, rowsFor } = world();
    const res = await client.post("/", { name: "QA", category: "active", projectId: "p-B" });
    expect(res.status).toBe(404);
    expect(rowsFor("p-B")).toEqual([]);
  });

  it("POST /fork refuses a projectId that does not exist", async () => {
    const { client } = world();
    expect((await client.post("/fork", { projectId: "nope" })).status).toBe(404);
  });

  it("POST /fork still forks the caller's own project", async () => {
    const { client, rowsFor } = world();
    const res = await client.post("/fork", { projectId: "p-A" });
    expect(res.status).toBe(200);
    expect(rowsFor("p-A")).toHaveLength(3);
  });

  it("POST / still adds a column to the caller's own project", async () => {
    const { client, rowsFor } = world();
    const res = await client.post("/", { name: "QA", category: "active", projectId: "p-A" });
    expect(res.status).toBe(201);
    expect(rowsFor("p-A")).toHaveLength(4);
  });
});
