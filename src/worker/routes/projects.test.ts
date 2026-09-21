import { describe, expect, it } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { routeClient } from "../../test/route-harness";
import { projectsRouter } from "./projects";

function world() {
  const { db, raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A'), ('ws-B', 'B');
    ${["u-owner", "u-member", "u-eve"].map((id) => `INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES ('${id}', '${id}', '${id}@x.test', '${now}', '${now}');`).join("\n")}
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES
      ('m-owner', 'ws-A', 'u-owner', 'owner', '${now}'), ('m-member', 'ws-A', 'u-member', 'member', '${now}'), ('m-eve', 'ws-B', 'u-eve', 'owner', '${now}');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl-A', 'ws-A', 'Client A'), ('cl-B', 'ws-B', 'Client B');
    INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p-A', 'ws-A', 'Mine', 'cl-A'), ('p-B', 'ws-B', 'Theirs', 'cl-B');
  `);
  const as = (userId: string, workspaceId: string) => routeClient(projectsRouter, db, { workspaceId, userId });
  const active = (id: string) => (raw.prepare(`SELECT active FROM projects WHERE id = ?`).get(id) as { active: number }).active;
  return { as, active };
}

describe("archiving a project (DELETE /:id)", () => {
  it("archives a project of the workspace and says so", async () => {
    const { as, active } = world();
    const res = await as("u-owner", "ws-A").del("/p-A");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(active("p-A")).toBe(0);
  });

  it("answers ok again when the project is already archived", async () => {
    const { as } = world();
    const owner = as("u-owner", "ws-A");
    await owner.del("/p-A");
    expect((await owner.del("/p-A")).status).toBe(200);
  });

  it("answers 404, not success, for an id that does not exist", async () => {
    const { as } = world();
    const res = await as("u-owner", "ws-A").del("/no-such-project");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("answers 404 for another workspace's project and leaves it active", async () => {
    const { as, active } = world();
    const res = await as("u-owner", "ws-A").del("/p-B");
    expect(res.status).toBe(404);
    expect(active("p-B")).toBe(1);
  });

  it("still refuses a plain member before looking at the project", async () => {
    const { as, active } = world();
    expect((await as("u-member", "ws-A").del("/p-A")).status).toBe(403);
    expect(active("p-A")).toBe(1);
  });
});
