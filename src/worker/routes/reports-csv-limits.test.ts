import { describe, expect, it } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { routeClient } from "../../test/route-harness";
import { reportsRouter } from "./reports";

const RANGE = "since=2026-01-01T00:00:00.000Z&until=2026-02-01T00:00:00.000Z";

function client() {
  const { db, raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A');
    INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES ('u-owner', 'o', 'o@x.test', '${now}', '${now}');
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES ('m-o', 'ws-A', 'u-owner', 'owner', '${now}');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl-A', 'ws-A', 'Client A');
    INSERT INTO projects (id, workspace_id, name, client_id) VALUES ('p1', 'ws-A', 'One', 'cl-A');
    INSERT INTO time_entries (id, workspace_id, user_id, project_id, description, start, stop, duration, billable)
      VALUES ('e1', 'ws-A', 'u-owner', 'p1', 'work', '2026-01-05T09:00:00.000Z', '2026-01-05T10:00:00.000Z', 3600, 1);
  `);
  return routeClient(reportsRouter, db, { workspaceId: "ws-A", userId: "u-owner" });
}
const ids = (n: number) => Array.from({ length: n }, (_, i) => `id-${i}`).join(",");

describe("report filters cap their id lists (S-32)", () => {
  it.each(["projectIds", "clientIds", "taskIds", "tagIds", "userIds"])("answers 400 to 5000 %s", async (key) => {
    expect((await client().get(`/summary?${RANGE}&${key}=${ids(5000)}`)).status).toBe(400);
  });

  it("answers 400 to one enormous unseparated value", async () => {
    expect((await client().get(`/summary?${RANGE}&projectIds=${"x".repeat(50_000)}`)).status).toBe(400);
  });

  it("filters exactly as before with a handful of ids, and at the 200-id cap", async () => {
    const res = await client().get(`/summary?${RANGE}&projectIds=p1,other`);
    expect(res.status).toBe(200);
    expect(((await res.json()) as { entryCount: number }).entryCount).toBe(1);
    expect((await client().get(`/summary?${RANGE}&projectIds=${ids(200)}`)).status).toBe(200);
    expect((await client().get(`/summary?${RANGE}&projectIds=${ids(201)}`)).status).toBe(400);
  });

  it("treats an absent or empty filter as no filter", async () => {
    expect(((await (await client().get(`/summary?${RANGE}&projectIds=`)).json()) as { entryCount: number }).entryCount).toBe(1);
  });
});
