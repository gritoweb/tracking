import { describe, expect, it } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { routeClient } from "../../test/route-harness";
import { timeEntriesRouter } from "./time-entries";

const RANGE = "since=2026-01-01T00:00:00.000Z&until=2026-02-01T00:00:00.000Z";
const DAY = "2026-01-05T";
const at = (time: string) => `${DAY}${time}.000Z`;

/** Two workspaces over one real database: ws-A has an owner, an admin and two members; ws-B has one owner. */
function world() {
  const { db, raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  const people = [["u-owner", "owner"], ["u-admin", "admin"], ["u-ana", "member"], ["u-bo", "member"]];
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A'), ('ws-B', 'B');
    ${["u-owner", "u-admin", "u-ana", "u-bo", "u-eve"].map((id) => `INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES ('${id}', '${id}', '${id}@x.test', '${now}', '${now}');`).join("\n")}
    ${people.map(([id, role]) => `INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES ('m-${id}', 'ws-A', '${id}', '${role}', '${now}');`).join("\n")}
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES ('m-eve', 'ws-B', 'u-eve', 'owner', '${now}');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl-A', 'ws-A', 'Client A'), ('cl-B', 'ws-B', 'Client B');
    INSERT INTO projects (id, workspace_id, name, client_id, active) VALUES ('p1', 'ws-A', 'One', 'cl-A', 1), ('p2', 'ws-A', 'Two', 'cl-A', 1);
    INSERT INTO projects (id, workspace_id, name, client_id, active) VALUES ('p-archived', 'ws-A', 'Old', 'cl-A', 0);
    INSERT INTO projects (id, workspace_id, name, client_id, active) VALUES ('p-noclient', 'ws-A', 'Loose', NULL, 1);
    INSERT INTO projects (id, workspace_id, name, client_id, active) VALUES ('p-B', 'ws-B', 'Elsewhere', 'cl-B', 1);
    INSERT INTO time_entries (id, workspace_id, user_id, project_id, description, start, stop, duration) VALUES
      ('e-ana', 'ws-A', 'u-ana', 'p1', 'ana done', '${at("09:00:00")}', '${at("10:00:00")}', 3600),
      ('e-bo', 'ws-A', 'u-bo', 'p1', 'bo done', '${at("09:00:00")}', '${at("10:00:00")}', 3600),
      ('e-B', 'ws-B', 'u-eve', 'p-B', 'eve done', '${at("09:00:00")}', '${at("10:00:00")}', 3600);
    INSERT INTO time_entries (id, workspace_id, user_id, project_id, description, start) VALUES
      ('e-ana-run', 'ws-A', 'u-ana', 'p1', 'ana running', '${at("12:00:00")}'),
      ('e-bo-run', 'ws-A', 'u-bo', 'p1', 'bo running', '${at("12:00:00")}');
  `);
  const as = (userId: string, workspaceId = "ws-A") => routeClient(timeEntriesRouter, db, { workspaceId, userId });
  const row = (id: string) => raw.prepare(`SELECT * FROM time_entries WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  const count = () => (raw.prepare(`SELECT COUNT(*) AS n FROM time_entries`).get() as { n: number }).n;
  return { as, row, count };
}

const ids = async (res: Response) => ((await res.json()) as { id: string }[]).map((e) => e.id).sort();

describe("GET / — whose hours a list shows (D3)", () => {
  it("shows a member only their own entries", async () => {
    const { as } = world();
    expect(await ids(await as("u-ana").get(`/?${RANGE}`))).toEqual(["e-ana", "e-ana-run"]);
  });

  it.each(["u-owner", "u-admin"])("shows an %s the whole workspace, and never another workspace's entries", async (person) => {
    const { as } = world();
    expect(await ids(await as(person).get(`/?${RANGE}`))).toEqual(["e-ana", "e-ana-run", "e-bo", "e-bo-run"]);
  });

  it("only returns entries that start inside the range", async () => {
    const { as } = world();
    expect(await ids(await as("u-owner").get("/?since=2026-02-01T00:00:00.000Z&until=2026-03-01T00:00:00.000Z"))).toEqual([]);
  });

  it("returns only the caller's own running timer for ?running=true, even to an owner", async () => {
    const { as } = world();
    expect(await ids(await as("u-ana").get("/?running=true"))).toEqual(["e-ana-run"]);
    expect(await ids(await as("u-owner").get("/?running=true"))).toEqual([]);
  });

  it("answers /current with the caller's timer, or null", async () => {
    const { as } = world();
    expect(((await (await as("u-bo").get("/current")).json()) as { id: string }).id).toBe("e-bo-run");
    expect(await (await as("u-owner").get("/current")).json()).toBeNull();
  });
});

describe("GET /:id", () => {
  it("lets a member open their own entry but answers 404 for a teammate's", async () => {
    const { as } = world();
    expect((await as("u-ana").get("/e-ana")).status).toBe(200);
    expect((await as("u-ana").get("/e-bo")).status).toBe(404);
  });

  it("lets an owner open anyone's, but not another workspace's", async () => {
    const { as } = world();
    expect((await as("u-owner").get("/e-bo")).status).toBe(200);
    expect((await as("u-owner").get("/e-B")).status).toBe(404);
  });
});

describe("POST / — every entry needs an active project with a client", () => {
  const entry = (projectId: string, extra: object = {}) => ({ projectId, description: "work", start: at("13:00:00"), stop: at("14:30:00"), ...extra });

  it("creates the entry for the caller with its duration", async () => {
    const { as, row } = world();
    const res = await as("u-ana").post("/", entry("p1"));
    expect(res.status).toBe(201);
    const { id } = (await res.json()) as { id: string };
    expect(row(id)).toMatchObject({ user_id: "u-ana", workspace_id: "ws-A", project_id: "p1", duration: 5400 });
  });

  it.each(["p-archived", "p-noclient", "p-B", "does-not-exist"])("refuses project %s and stores nothing", async (projectId) => {
    const { as, count } = world();
    const before = count();
    expect((await as("u-ana").post("/", entry(projectId))).status).toBe(400);
    expect(count()).toBe(before);
  });

  it("refuses a request with no project at all", async () => {
    const { as, count } = world();
    const before = count();
    expect((await as("u-ana").post("/", { description: "x", start: at("13:00:00"), stop: at("14:00:00") })).status).toBe(400);
    expect(count()).toBe(before);
  });

  it("starting a timer stops the caller's running one at the new start, and leaves a teammate's running", async () => {
    const { as, row } = world();
    const res = await as("u-ana").post("/", { projectId: "p2", description: "next", start: at("13:00:00") });
    expect(res.status).toBe(201);
    expect(row("e-ana-run")).toMatchObject({ stop: at("13:00:00"), duration: 3600 });
    expect(row("e-bo-run")?.stop).toBeNull();
  });
});

describe("PUT /:id", () => {
  it("lets a member edit their own entry", async () => {
    const { as, row } = world();
    expect((await as("u-ana").put("/e-ana", { description: "renamed" })).status).toBe(200);
    expect(row("e-ana")?.description).toBe("renamed");
  });

  it("refuses a member editing a teammate's entry", async () => {
    const { as, row } = world();
    expect((await as("u-ana").put("/e-bo", { description: "hijacked" })).status).toBe(403);
    expect(row("e-bo")?.description).toBe("bo done");
  });

  it("lets an admin edit a teammate's finished entry", async () => {
    const { as, row } = world();
    expect((await as("u-admin").put("/e-bo", { description: "fixed by admin" })).status).toBe(200);
    expect(row("e-bo")?.description).toBe("fixed by admin");
  });

  it("keeps a running timer to the person tracking, even against an admin", async () => {
    const { as, row } = world();
    const res = await as("u-admin").put("/e-ana-run", { description: "nope" });
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Only the person tracking can change a running timer" });
    expect(row("e-ana-run")?.description).toBe("ana running");
  });

  it("recomputes the duration when the stop changes", async () => {
    const { as, row } = world();
    await as("u-ana").put("/e-ana", { stop: at("11:00:00") });
    expect(row("e-ana")).toMatchObject({ stop: at("11:00:00"), duration: 7200 });
  });

  it("refuses a stop before the existing start, even from a one-field edit, and changes nothing", async () => {
    const { as, row } = world();
    expect((await as("u-ana").put("/e-ana", { stop: at("08:00:00") })).status).toBe(400);
    expect(row("e-ana")).toMatchObject({ stop: at("10:00:00"), duration: 3600 });
  });

  it("refuses to move an entry to an archived project", async () => {
    const { as, row } = world();
    expect((await as("u-ana").put("/e-ana", { projectId: "p-archived" })).status).toBe(400);
    expect(row("e-ana")?.project_id).toBe("p1");
  });

  it("answers 404 for another workspace's entry and leaves it alone", async () => {
    const { as, row } = world();
    expect((await as("u-owner").put("/e-B", { description: "cross-tenant" })).status).toBe(404);
    expect(row("e-B")?.description).toBe("eve done");
  });
});

describe("DELETE /:id", () => {
  it("lets a member delete their own entry", async () => {
    const { as, row } = world();
    expect((await as("u-ana").del("/e-ana")).status).toBe(200);
    expect(row("e-ana")).toBeUndefined();
  });

  it("refuses a member deleting a teammate's entry", async () => {
    const { as, row } = world();
    expect((await as("u-ana").del("/e-bo")).status).toBe(403);
    expect(row("e-bo")).toBeDefined();
  });

  it("lets an admin delete a teammate's finished entry but not their running timer", async () => {
    const { as, row } = world();
    expect((await as("u-admin").del("/e-bo")).status).toBe(200);
    expect((await as("u-admin").del("/e-bo-run")).status).toBe(403);
    expect(row("e-bo")).toBeUndefined();
    expect(row("e-bo-run")).toBeDefined();
  });

  it("answers 404 for another workspace's entry and leaves it alone", async () => {
    const { as, row } = world();
    expect((await as("u-owner").del("/e-B")).status).toBe(404);
    expect(row("e-B")).toBeDefined();
  });
});

describe("PATCH /bulk and DELETE /bulk", () => {
  it("refuses the whole bulk edit when one entry is a teammate's, and changes none", async () => {
    const { as, row } = world();
    const res = await as("u-ana").patch("/bulk", { ids: ["e-ana", "e-bo"], patch: { description: "bulk" } });
    expect(res.status).toBe(403);
    expect([row("e-ana")?.description, row("e-bo")?.description]).toEqual(["ana done", "bo done"]);
  });

  it("lets an owner edit several people's finished entries at once", async () => {
    const { as, row } = world();
    expect((await as("u-owner").patch("/bulk", { ids: ["e-ana", "e-bo"], patch: { description: "bulk" } })).status).toBe(200);
    expect([row("e-ana")?.description, row("e-bo")?.description]).toEqual(["bulk", "bulk"]);
  });

  it("does not reach into another workspace when it is handed one of its ids", async () => {
    const { as, row } = world();
    await as("u-owner").patch("/bulk", { ids: ["e-ana", "e-B"], patch: { description: "bulk" } });
    expect([row("e-ana")?.description, row("e-B")?.description]).toEqual(["bulk", "eve done"]);
  });

  it("refuses a bulk edit to an archived project", async () => {
    const { as, row } = world();
    expect((await as("u-owner").patch("/bulk", { ids: ["e-ana"], patch: { projectId: "p-archived" } })).status).toBe(400);
    expect(row("e-ana")?.project_id).toBe("p1");
  });

  it("refuses a bulk delete that includes a teammate's entry, and deletes none", async () => {
    const { as, count } = world();
    const before = count();
    expect((await as("u-ana").del("/bulk", { ids: ["e-ana", "e-bo"] })).status).toBe(403);
    expect(count()).toBe(before);
  });

  it("deletes only this workspace's entries when handed another workspace's id", async () => {
    const { as, row } = world();
    expect((await as("u-owner").del("/bulk", { ids: ["e-ana", "e-B"] })).status).toBe(200);
    expect([row("e-ana"), row("e-B")]).toEqual([undefined, expect.anything()]);
  });

  it("refuses to bulk-delete someone's running timer", async () => {
    const { as, row } = world();
    expect((await as("u-owner").del("/bulk", { ids: ["e-bo-run"] })).status).toBe(403);
    expect(row("e-bo-run")).toBeDefined();
  });
});

describe("PATCH /:id/stop", () => {
  it("stops the caller's own timer and records its duration", async () => {
    const { as, row } = world();
    expect((await as("u-ana").patch("/e-ana-run/stop")).status).toBe(200);
    expect(row("e-ana-run")?.stop).not.toBeNull();
    expect(Number(row("e-ana-run")?.duration)).toBeGreaterThan(0);
  });

  it("refuses to stop someone else's timer", async () => {
    const { as, row } = world();
    expect((await as("u-owner").patch("/e-ana-run/stop")).status).toBe(403);
    expect(row("e-ana-run")?.stop).toBeNull();
  });

  it("answers null for an id that no longer exists, as the extension after a reload expects", async () => {
    const { as } = world();
    const res = await as("u-ana").patch("/gone/stop");
    expect(res.status).toBe(200);
    expect(await res.json()).toBeNull();
  });

  it("leaves an already stopped entry as it was", async () => {
    const { as, row } = world();
    expect((await as("u-ana").patch("/e-ana/stop")).status).toBe(200);
    expect(row("e-ana")).toMatchObject({ stop: at("10:00:00"), duration: 3600 });
  });
});
