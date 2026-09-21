import { describe, expect, it } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { routeClient } from "../../test/route-harness";
import { favoritesRouter } from "./favorites";

function world() {
  const { db, raw } = createMigratedD1();
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A'), ('ws-B', 'B');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl-A', 'ws-A', 'Client A'), ('cl-B', 'ws-B', 'Client B');
    INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p-A', 'ws-A', 'Mine', 'cl-A'), ('p-B', 'ws-B', 'Secret project', 'cl-B');
    INSERT INTO favorites (id, workspace_id, description, project_id, tags, billable, created_at) VALUES
      ('f-old', 'ws-A', 'old', 'p-A', '["a"]', 1, '2026-01-01T00:00:00.000Z'),
      ('f-new', 'ws-A', 'new', 'p-A', '[]', 0, '2026-01-02T00:00:00.000Z'),
      ('f-B', 'ws-B', 'theirs', 'p-B', '[]', 0, '2026-01-03T00:00:00.000Z');
  `);
  const as = (workspaceId: string) => routeClient(favoritesRouter, db, { workspaceId, userId: "u-1" });
  const row = (id: string) => raw.prepare(`SELECT * FROM favorites WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  return { as, row };
}

describe("the favorites routes", () => {
  it("lists this workspace's favorites, newest first, with their project's name and tags", async () => {
    const { as } = world();
    const list = (await (await as("ws-A").get("/")).json()) as { id: string; projectName: string | null; tags: string[] }[];
    expect(list.map((f) => f.id)).toEqual(["f-new", "f-old"]);
    expect(list[1]).toMatchObject({ projectName: "Mine", tags: ["a"] });
  });

  it("creates a favorite for the workspace", async () => {
    const { as, row } = world();
    const res = await as("ws-A").post("/", { description: "standup", projectId: "p-A", tags: ["x", "y"], billable: true });
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(row(id)).toMatchObject({ workspace_id: "ws-A", description: "standup", project_id: "p-A", tags: '["x","y"]', billable: 1 });
  });

  it("does not disclose another workspace's project name through a favorite that points at it", async () => {
    const { as } = world();
    const res = await as("ws-A").post("/", { description: "sneaky", projectId: "p-B", tags: [] });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { projectName: string | null; projectColor: string | null };
    expect(body.projectName).toBeNull();
    expect(JSON.stringify(await (await as("ws-A").get("/")).json())).not.toContain("Secret project");
  });

  it("deletes a favorite of its own workspace but leaves another workspace's alone", async () => {
    const { as, row } = world();
    await as("ws-A").del("/f-B");
    expect(row("f-B")).toBeDefined();
    await as("ws-A").del("/f-old");
    expect(row("f-old")).toBeUndefined();
  });
});
