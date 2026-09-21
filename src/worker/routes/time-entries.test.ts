import { describe, expect, it } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { routeClient } from "../../test/route-harness";
import { timeEntriesRouter } from "./time-entries";

const RANGE = "since=2026-01-01T00:00:00.000Z&until=2026-02-01T00:00:00.000Z";
const DAY = "2026-01-05T";
const at = (time: string) => `${DAY}${time}.000Z`;

/** D1 rejects a statement with more than 100 bound parameters; node:sqlite allows ~32k, so the harness alone would hide it. */
function withD1ParamLimit(db: D1Database, counter?: { prepared: number }): D1Database {
  return {
    prepare(sql: string) {
      if (counter) counter.prepared++;
      const statement = db.prepare(sql);
      const bind = statement.bind.bind(statement);
      statement.bind = (...values: unknown[]) => {
        if (values.length > 100) throw new Error("D1_ERROR: too many SQL variables");
        return bind(...values);
      };
      return statement;
    },
    batch: (statements: unknown[]) => (db.batch as (s: unknown[]) => Promise<unknown>)(statements),
  } as unknown as D1Database;
}

/** Two workspaces over one real database: ws-A has an owner, an admin and two members; ws-B has one owner. */
function world() {
  const { db: unlimited, raw } = createMigratedD1();
  const counter = { prepared: 0 };
  const db = withD1ParamLimit(unlimited, counter);
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
    INSERT INTO tasks (id, workspace_id, project_id, name) VALUES ('t-A', 'ws-A', 'p1', 'Task A'), ('t-B', 'ws-B', 'p-B', 'Task B');
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
  return { as, row, count, raw, counter };
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

/** `n` finished entries owned by Ana in ws-A, ids `bulk-0..n-1`. */
function seedBulk(raw: ReturnType<typeof world>["raw"], n: number) {
  const insert = raw.prepare(
    `INSERT INTO time_entries (id, workspace_id, user_id, project_id, description, start, stop, duration)
     VALUES (?, 'ws-A', 'u-ana', 'p1', 'seed', ?, ?, 60)`
  );
  const ids: string[] = [];
  raw.exec("BEGIN");
  for (let i = 0; i < n; i++) {
    ids.push(`bulk-${i}`);
    insert.run(`bulk-${i}`, `2026-01-06T00:${String(i % 60).padStart(2, "0")}:00.000Z`, `2026-01-06T00:${String(i % 60).padStart(2, "0")}:30.000Z`);
  }
  raw.exec("COMMIT");
  return ids;
}

describe("bulk endpoints past D1's 100-parameter statement ceiling (S-10)", () => {
  it.each([97, 98, 100, 200, 500, 10_000])("edits all %i entries in one PATCH", async (n) => {
    const { as, raw } = world();
    const ids = seedBulk(raw, n);
    const res = await as("u-ana").patch("/bulk", { ids, patch: { description: "bulk", billable: true } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, updated: n });
    const changed = raw.prepare(`SELECT COUNT(*) AS n FROM time_entries WHERE description = 'bulk' AND billable = 1`).get() as { n: number };
    expect(changed.n).toBe(n);
  });

  it.each([97, 98, 100, 200, 500, 10_000])("deletes all %i entries in one DELETE", async (n) => {
    const { as, raw } = world();
    const ids = seedBulk(raw, n);
    const res = await as("u-ana").del("/bulk", { ids });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted: n });
    const left = raw.prepare(`SELECT COUNT(*) AS n FROM time_entries WHERE id LIKE 'bulk-%'`).get() as { n: number };
    expect(left.n).toBe(0);
  });

  it("refuses more than 10,000 ids with a clean 400 and touches nothing", async () => {
    const { as, raw } = world();
    const ids = seedBulk(raw, 10_001);
    expect((await as("u-ana").patch("/bulk", { ids, patch: { description: "bulk" } })).status).toBe(400);
    expect((await as("u-ana").del("/bulk", { ids })).status).toBe(400);
    const left = raw.prepare(`SELECT COUNT(*) AS n FROM time_entries WHERE id LIKE 'bulk-%' AND description = 'seed'`).get() as { n: number };
    expect(left.n).toBe(10_001);
  });

  it.each([
    ["PATCH", 10_000],
    ["DELETE", 10_000],
  ])("keeps a %s of %i ids far under the 1000 queries a Worker invocation may run", async (method, n) => {
    const { as, raw, counter } = world();
    const ids = seedBulk(raw, n);
    counter.prepared = 0;
    const res = method === "PATCH" ? await as("u-ana").patch("/bulk", { ids, patch: { billable: true } }) : await as("u-ana").del("/bulk", { ids });
    expect(res.status).toBe(200);
    console.info(`${method} ${n} ids -> ${counter.prepared} prepared statements`);
    expect(counter.prepared).toBeLessThan(400);
  });

  it("still refuses a teammate's entry hidden among 200 ids, and changes none", async () => {
    const { as, raw } = world();
    const ids = [...seedBulk(raw, 199), "e-bo"];
    expect((await as("u-ana").patch("/bulk", { ids, patch: { description: "bulk" } })).status).toBe(403);
    expect((await as("u-ana").del("/bulk", { ids })).status).toBe(403);
    const touched = raw.prepare(`SELECT COUNT(*) AS n FROM time_entries WHERE description = 'bulk'`).get() as { n: number };
    expect(touched.n).toBe(0);
  });

  it("does not reach another workspace's entry sitting in a later chunk", async () => {
    const { as, raw, row } = world();
    const ids = [...seedBulk(raw, 150), "e-B"];
    expect((await as("u-owner").patch("/bulk", { ids, patch: { description: "bulk" } })).status).toBe(200);
    expect((await as("u-owner").del("/bulk", { ids })).status).toBe(200);
    expect(row("e-B")?.description).toBe("eve done");
  });
});

describe("bulk counts are the rows really affected (S-27)", () => {
  it("counts only this workspace's rows, not the ids sent", async () => {
    const { as } = world();
    const res = await as("u-owner").patch("/bulk", { ids: ["e-ana", "e-B", "ghost"], patch: { description: "x" } });
    expect(await res.json()).toEqual({ ok: true, updated: 1 });
    const del = await as("u-owner").del("/bulk", { ids: ["e-ana", "e-B", "ghost"] });
    expect(await del.json()).toEqual({ ok: true, deleted: 1 });
  });

  it("counts an id repeated across chunks once", async () => {
    const { as, raw } = world();
    const ids = seedBulk(raw, 100);
    const res = await as("u-ana").del("/bulk", { ids: [...ids, ...ids] });
    expect(await res.json()).toEqual({ ok: true, deleted: 100 });
  });

  it("counts a tags-only patch by the entries it reached", async () => {
    const { as } = world();
    const res = await as("u-owner").patch("/bulk", { ids: ["e-ana", "e-B"], patch: { tags: ["urgent"] } });
    expect(await res.json()).toEqual({ ok: true, updated: 1 });
  });
});

describe("a task must belong to the workspace (S-19)", () => {
  const entry = (extra: object) => ({ projectId: "p1", description: "work", start: at("13:00:00"), stop: at("14:00:00"), ...extra });

  it("POST refuses another workspace's task and stores nothing", async () => {
    const { as, count } = world();
    const before = count();
    expect((await as("u-ana").post("/", entry({ taskId: "t-B" }))).status).toBe(400);
    expect((await as("u-ana").post("/", entry({ taskId: "no-such-task" }))).status).toBe(400);
    expect(count()).toBe(before);
  });

  it("POST accepts this workspace's task and a null one", async () => {
    const { as, row } = world();
    const ok = (await (await as("u-ana").post("/", entry({ taskId: "t-A" }))).json()) as { id: string };
    expect(row(ok.id)?.task_id).toBe("t-A");
    const none = await as("u-ana").post("/", entry({ taskId: null, start: at("15:00:00"), stop: at("16:00:00") }));
    expect(none.status).toBe(201);
  });

  it("PUT refuses another workspace's task and keeps the old one", async () => {
    const { as, row } = world();
    expect((await as("u-ana").put("/e-ana", { taskId: "t-B" })).status).toBe(400);
    expect(row("e-ana")?.task_id).toBeNull();
    expect((await as("u-ana").put("/e-ana", { taskId: "t-A" })).status).toBe(200);
    expect(row("e-ana")?.task_id).toBe("t-A");
    expect((await as("u-ana").put("/e-ana", { taskId: null })).status).toBe(200);
    expect(row("e-ana")?.task_id).toBeNull();
  });

  it("PATCH /bulk refuses another workspace's task and changes nothing", async () => {
    const { as, row } = world();
    expect((await as("u-owner").patch("/bulk", { ids: ["e-ana", "e-bo"], patch: { taskId: "t-B", description: "x" } })).status).toBe(400);
    expect([row("e-ana")?.task_id, row("e-ana")?.description]).toEqual([null, "ana done"]);
    expect((await as("u-owner").patch("/bulk", { ids: ["e-ana"], patch: { taskId: "t-A" } })).status).toBe(200);
    expect(row("e-ana")?.task_id).toBe("t-A");
  });
});

describe("bulk tag replacement stays in a handful of statements", () => {
  const tagsOf = (raw: ReturnType<typeof world>["raw"], id: string) =>
    (raw.prepare(`SELECT tg.name FROM time_entry_tags tet JOIN tags tg ON tg.id = tet.tag_id WHERE tet.time_entry_id = ? ORDER BY tg.name`).all(id) as { name: string }[]).map((r) => r.name);

  it("gives 499 entries (plus a foreign id, 500 sent) exactly the new tags, drops the old ones, colours new tags, in few statements", async () => {
    const { as, raw, counter } = world();
    const ids = seedBulk(raw, 499);
    raw.exec(`
      INSERT INTO tags (id, workspace_id, name, color) VALUES ('tg-old', 'ws-A', 'old', '#111111'), ('tg-a', 'ws-A', 'a', '#222222');
      INSERT INTO time_entry_tags (time_entry_id, tag_id) SELECT id, 'tg-old' FROM time_entries WHERE id LIKE 'bulk-%';
      INSERT INTO tags (id, workspace_id, name, color) VALUES ('tg-B-a', 'ws-B', 'a', '#333333');
      INSERT INTO time_entry_tags (time_entry_id, tag_id) VALUES ('e-B', 'tg-B-a');
    `);
    counter.prepared = 0;
    const res = await as("u-ana").patch("/bulk", { ids: [...ids, "e-B"], patch: { tags: ["a", "b"] } });
    expect(res.status).toBe(200);
    console.info(`tags patch on 500 sent ids -> ${counter.prepared} prepared statements`);
    expect(counter.prepared).toBeLessThan(60);
    expect(await res.json()).toEqual({ ok: true, updated: 499 });

    const wrong = ids.filter((id) => tagsOf(raw, id).join() !== "a,b");
    expect(wrong).toEqual([]);
    const b = raw.prepare(`SELECT color FROM tags WHERE workspace_id = 'ws-A' AND name = 'b'`).get() as { color: string | null };
    expect(b.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect((raw.prepare(`SELECT color FROM tags WHERE id = 'tg-a'`).get() as { color: string }).color).toBe("#222222");
    // The other workspace's entry and tag are untouched.
    expect(tagsOf(raw, "e-B")).toEqual(["a"]);
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM tags WHERE workspace_id = 'ws-B'`).get()).toEqual({ n: 1 });
  });

  it("clears every tag with an empty list", async () => {
    const { as, raw } = world();
    const ids = seedBulk(raw, 120);
    raw.exec(`INSERT INTO tags (id, workspace_id, name) VALUES ('tg-old', 'ws-A', 'old');
              INSERT INTO time_entry_tags (time_entry_id, tag_id) SELECT id, 'tg-old' FROM time_entries WHERE id LIKE 'bulk-%';`);
    expect((await as("u-ana").patch("/bulk", { ids, patch: { tags: [] } })).status).toBe(200);
    expect(raw.prepare(`SELECT COUNT(*) AS n FROM time_entry_tags`).get()).toEqual({ n: 0 });
  });

  it("combines tags with another field in the same call", async () => {
    const { as, raw, row } = world();
    const ids = seedBulk(raw, 100);
    const res = await as("u-ana").patch("/bulk", { ids, patch: { tags: ["x"], description: "both" } });
    expect(await res.json()).toEqual({ ok: true, updated: 100 });
    expect([row("bulk-99")?.description, tagsOf(raw, "bulk-99")]).toEqual(["both", ["x"]]);
  });

  it("refuses tags on more than 500 ids with a 400, but not a plain edit of them", async () => {
    const { as, raw } = world();
    const ids = seedBulk(raw, 501);
    expect((await as("u-ana").patch("/bulk", { ids, patch: { tags: ["a"] } })).status).toBe(400);
    expect((await as("u-ana").patch("/bulk", { ids, patch: { billable: true } })).status).toBe(200);
  });

  it("refuses more than 50 tags with a 400", async () => {
    const { as, raw } = world();
    const ids = seedBulk(raw, 3);
    const tags = Array.from({ length: 51 }, (_, i) => `t${i}`);
    expect((await as("u-ana").patch("/bulk", { ids, patch: { tags } })).status).toBe(400);
  });
});
