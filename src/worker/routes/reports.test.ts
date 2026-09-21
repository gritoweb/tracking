import { describe, expect, it } from "vitest";
import { createMigratedD1 } from "../../test/sqlite-d1";
import { routeClient } from "../../test/route-harness";
import { reportsRouter } from "./reports";

const RANGE = "since=2026-01-01T00:00:00.000Z&until=2026-02-01T00:00:00.000Z";

/**
 * ws-A: ana (member) 1h billable on p1 + 20min non-billable on p2, bo (member) 50min billable on p1,
 * one running timer and one December entry that no January report may count. ws-B: eve, 2h.
 * p1 bills 100/h, p2 60/h.
 */
function world() {
  const { db, raw } = createMigratedD1();
  const now = "2026-01-01 00:00:00";
  const people = [["u-owner", "owner"], ["u-admin", "admin"], ["u-ana", "member"], ["u-bo", "member"]];
  raw.exec(`
    INSERT INTO workspaces (id, name) VALUES ('ws-A', 'A'), ('ws-B', 'B');
    ${["u-owner", "u-admin", "u-ana", "u-bo", "u-eve"].map((id) => `INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES ('${id}', 'Name ${id}', '${id}@x.test', '${now}', '${now}');`).join("\n")}
    ${people.map(([id, role]) => `INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES ('m-${id}', 'ws-A', '${id}', '${role}', '${now}');`).join("\n")}
    INSERT INTO "member" (id, organizationId, userId, role, createdAt) VALUES ('m-eve', 'ws-B', 'u-eve', 'owner', '${now}');
    INSERT INTO clients (id, workspace_id, name) VALUES ('cl-A', 'ws-A', 'Client A'), ('cl-B', 'ws-B', 'Client B');
    INSERT INTO projects (id, workspace_id, name, client_id, rate, billable) VALUES ('p1', 'ws-A', 'One', 'cl-A', 100, 1), ('p2', 'ws-A', 'Two', 'cl-A', 60, 0), ('p-B', 'ws-B', 'Elsewhere', 'cl-B', 100, 1);
    INSERT INTO time_entries (id, workspace_id, user_id, project_id, description, start, stop, duration, billable) VALUES
      ('e1', 'ws-A', 'u-ana', 'p1', 'standup', '2026-01-05T09:00:00.000Z', '2026-01-05T10:00:00.000Z', 3600, 1),
      ('e2', 'ws-A', 'u-ana', 'p2', 'review', '2026-01-05T11:00:00.000Z', '2026-01-05T11:20:00.000Z', 1200, 0),
      ('e3', 'ws-A', 'u-bo', 'p1', 'deploy', '2026-01-06T09:00:00.000Z', '2026-01-06T09:50:00.000Z', 3000, 1),
      ('e-dec', 'ws-A', 'u-ana', 'p1', 'last year', '2025-12-31T09:00:00.000Z', '2025-12-31T10:00:00.000Z', 3600, 1),
      ('e-B', 'ws-B', 'u-eve', 'p-B', 'eve work', '2026-01-05T09:00:00.000Z', '2026-01-05T11:00:00.000Z', 7200, 1);
    INSERT INTO time_entries (id, workspace_id, user_id, project_id, description, start, billable) VALUES
      ('e-run', 'ws-A', 'u-ana', 'p1', 'still running', '2026-01-07T09:00:00.000Z', 1);
    -- Outside RANGE (2026-01-01..02-01) on purpose, so it never touches the totals asserted above —
    -- a dedicated describe block below queries a wider range just for this row.
    INSERT INTO tasks (id, workspace_id, project_id, name) VALUES ('t-B-secret', 'ws-B', 'p-B', 'Elsewhere Secret Task');
    INSERT INTO time_entries (id, workspace_id, user_id, project_id, task_id, description, start, stop, duration, billable) VALUES
      ('e-cross', 'ws-A', 'u-ana', 'p1', 't-B-secret', 'cross-tenant task_id', '2026-03-01T12:00:00.000Z', '2026-03-01T12:30:00.000Z', 1800, 1);
  `);
  const as = (userId: string, workspaceId = "ws-A") => routeClient(reportsRouter, db, { workspaceId, userId });
  return { as };
}

interface Summary {
  totalSeconds: number;
  billableSeconds: number;
  billableAmount: number;
  entryCount: number;
  byProject: { id: string; totalSeconds: number }[];
  daily: { date: string; totalSeconds: number }[];
}
const summary = async (res: Response) => (await res.json()) as Summary;

describe("GET /summary — whose hours it covers", () => {
  it("adds up the whole workspace for an owner, ignoring running timers, other dates and other workspaces", async () => {
    const { as } = world();
    const body = await summary(await as("u-owner").get(`/summary?${RANGE}`));
    expect(body).toMatchObject({ totalSeconds: 7800, billableSeconds: 6600, entryCount: 3 });
    expect(body.billableAmount).toBeCloseTo(100 + (3000 / 3600) * 100, 5);
  });

  it("gives an admin the same whole-workspace view", async () => {
    const { as } = world();
    expect((await summary(await as("u-admin").get(`/summary?${RANGE}`))).totalSeconds).toBe(7800);
  });

  it("limits a member to their own hours", async () => {
    const { as } = world();
    expect(await summary(await as("u-ana").get(`/summary?${RANGE}`))).toMatchObject({ totalSeconds: 4800, entryCount: 2 });
    expect((await summary(await as("u-bo").get(`/summary?${RANGE}`))).totalSeconds).toBe(3000);
  });

  it("keeps a member on their own hours even when they ask for a teammate's (userIds)", async () => {
    const { as } = world();
    expect((await summary(await as("u-ana").get(`/summary?${RANGE}&userIds=u-bo`))).totalSeconds).toBe(4800);
  });

  it("lets an owner narrow to one person", async () => {
    const { as } = world();
    expect((await summary(await as("u-owner").get(`/summary?${RANGE}&userIds=u-bo`))).totalSeconds).toBe(3000);
  });

  it("never reaches across workspaces: the other workspace's owner sees only their own hours", async () => {
    const { as } = world();
    expect((await summary(await as("u-eve", "ws-B").get(`/summary?${RANGE}`))).totalSeconds).toBe(7200);
  });

  it("refuses a query with no range", async () => {
    const { as } = world();
    expect((await as("u-owner").get("/summary")).status).toBe(400);
  });
});

describe("GET /summary — filters and rounding", () => {
  it("breaks the total down by project and by day", async () => {
    const { as } = world();
    const body = await summary(await as("u-owner").get(`/summary?${RANGE}`));
    expect(Object.fromEntries(body.byProject.map((p) => [p.id, p.totalSeconds]))).toEqual({ p1: 6600, p2: 1200 });
    expect(Object.fromEntries(body.daily.map((d) => [d.date, d.totalSeconds]))).toEqual({ "2026-01-05": 4800, "2026-01-06": 3000 });
  });

  it("filters by project, by billable and by description", async () => {
    const { as } = world();
    expect((await summary(await as("u-owner").get(`/summary?${RANGE}&projectIds=p2`))).totalSeconds).toBe(1200);
    expect((await summary(await as("u-owner").get(`/summary?${RANGE}&billable=nonbillable`))).totalSeconds).toBe(1200);
    expect((await summary(await as("u-owner").get(`/summary?${RANGE}&billable=billable`))).totalSeconds).toBe(6600);
    expect((await summary(await as("u-owner").get(`/summary?${RANGE}&search=REVIEW`))).totalSeconds).toBe(1200);
  });

  it("treats % and _ in a search as plain characters, not wildcards", async () => {
    const { as } = world();
    expect((await summary(await as("u-owner").get(`/summary?${RANGE}&search=%25`))).entryCount).toBe(0);
    expect((await summary(await as("u-owner").get(`/summary?${RANGE}&search=_`))).entryCount).toBe(0);
  });

  it("rounds each entry before adding them up", async () => {
    const { as } = world();
    // 3600 → 3600, 1200 → 1800, 3000 → 3600 when rounding up to 15 minutes.
    expect((await summary(await as("u-owner").get(`/summary?${RANGE}&roundMode=up&roundMinutes=15`))).totalSeconds).toBe(9000);
    // 3600 → 3600, 1200 → 900, 3000 → 2700 when rounding down.
    expect((await summary(await as("u-owner").get(`/summary?${RANGE}&roundMode=down&roundMinutes=15`))).totalSeconds).toBe(7200);
  });
});

describe("GET /grouped", () => {
  interface Grouped { totalSeconds: number; groups: { id: string | null; totalSeconds: number; subGroups?: { id: string | null; totalSeconds: number }[] }[] }

  it("groups by person for an owner", async () => {
    const { as } = world();
    const body = (await (await as("u-owner").get(`/grouped?${RANGE}&group=user`)).json()) as Grouped;
    expect(Object.fromEntries(body.groups.map((g) => [g.id, g.totalSeconds]))).toEqual({ "u-ana": 4800, "u-bo": 3000 });
  });

  it("shows a member only themselves when grouping by person", async () => {
    const { as } = world();
    const body = (await (await as("u-ana").get(`/grouped?${RANGE}&group=user`)).json()) as Grouped;
    expect(body.groups.map((g) => g.id)).toEqual(["u-ana"]);
    expect(body.totalSeconds).toBe(4800);
  });

  it("nests a sub-group and keeps the totals consistent", async () => {
    const { as } = world();
    const body = (await (await as("u-owner").get(`/grouped?${RANGE}&group=project&subGroup=user`)).json()) as Grouped;
    const one = body.groups.find((g) => g.id === "p1");
    expect(one?.totalSeconds).toBe(6600);
    expect(Object.fromEntries((one?.subGroups ?? []).map((s) => [s.id, s.totalSeconds]))).toEqual({ "u-ana": 3600, "u-bo": 3000 });
  });
});

describe("GET /weekly and GET /detailed", () => {
  it("buckets the days of a week for an owner and only the member's own for a member", async () => {
    const { as } = world();
    const days = async (person: string) =>
      ((await (await as(person).get(`/weekly?${RANGE}`)).json()) as { days: { date: string; totalSeconds: number }[] }[])
        .flatMap((w) => w.days)
        .map((d) => [d.date, d.totalSeconds]);
    expect(await days("u-owner")).toEqual([["2026-01-05", 4800], ["2026-01-06", 3000]]);
    expect(await days("u-bo")).toEqual([["2026-01-06", 3000]]);
  });

  it("lists entries with their amount, newest first, and only the member's own for a member", async () => {
    const { as } = world();
    const rows = (await (await as("u-owner").get(`/detailed?${RANGE}`)).json()) as { id: string; amount: number; userId: string }[];
    expect(rows.map((r) => r.id)).toEqual(["e3", "e2", "e1"]);
    expect(Object.fromEntries(rows.map((r) => [r.id, r.amount]))).toEqual({ e1: 100, e2: 0, e3: (3000 / 3600) * 100 });
    const mine = (await (await as("u-ana").get(`/detailed?${RANGE}`)).json()) as { userId: string }[];
    expect(mine.every((r) => r.userId === "u-ana")).toBe(true);
    expect(mine).toHaveLength(2);
  });

  it("applies rounding to the amount too", async () => {
    const { as } = world();
    const rows = (await (await as("u-owner").get(`/detailed?${RANGE}&roundMode=up&roundMinutes=60`)).json()) as { id: string; duration: number; amount: number }[];
    const e3 = rows.find((r) => r.id === "e3");
    expect(e3).toMatchObject({ duration: 3600, amount: 100 });
  });
});

// SECURITY.md S-03: task_id isn't validated against workspace_id on write (a separate, known gap —
// see time-entries.ts), so a time entry can end up pointing at a task from another workspace. These
// three reports must never resolve that foreign id back to a name — only "No task"/null.
describe("tenant isolation — a foreign task_id never resolves to that task's name", () => {
  const CROSS_RANGE = "since=2026-03-01T00:00:00.000Z&until=2026-03-02T00:00:00.000Z";

  it("GET /detailed shows no task name for the cross-workspace row", async () => {
    const { as } = world();
    const rows = (await (await as("u-owner").get(`/detailed?${CROSS_RANGE}`)).json()) as { id: string; taskId: string | null; taskName: string | null }[];
    const row = rows.find((r) => r.id === "e-cross");
    expect(row?.taskId).toBe("t-B-secret"); // the raw id is still there — only the joined name must not leak
    expect(row?.taskName).not.toBe("Elsewhere Secret Task");
    expect(row?.taskName ?? null).toBeNull();
  });

  it("GET /summary byTask never shows the other workspace's task name", async () => {
    const { as } = world();
    const raw = (await (await as("u-owner").get(`/summary?${CROSS_RANGE}`)).json()) as { byTask: { id: string; name: string }[] };
    const row = raw.byTask.find((t) => t.id === "t-B-secret");
    expect(row?.name).not.toBe("Elsewhere Secret Task");
    expect(row?.name).toBe("No task");
  });

  it("GET /grouped?group=task never shows the other workspace's task name", async () => {
    const { as } = world();
    const raw = (await (await as("u-owner").get(`/grouped?${CROSS_RANGE}&group=task`)).json()) as { groups: { id: string | null; name?: string }[] };
    const row = raw.groups.find((g) => g.id === "t-B-secret");
    expect(row?.name).not.toBe("Elsewhere Secret Task");
  });
});
